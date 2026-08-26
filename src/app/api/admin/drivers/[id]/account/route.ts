import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import {
  canLinkExistingUserToDriver,
  hashDriverPassword,
  normalizeDriverLoginEmail,
  resolveDriverInitialPassword,
  sanitizeDriverForAdmin,
  uniqueConstraintTarget,
} from '@/lib/admin/driverProvisioning'
import { writeAuditLog } from '@/lib/auditLog'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  initialPassword: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().min(8).max(100).nullable().optional()
    ),
  linkExistingUser: z.boolean().optional(),
  resetExistingPassword: z.boolean().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('drivers')
  if (!guard.ok) return guard.response

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const driver = await prisma.driver.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, role: true, disabledAt: true } } },
  })
  if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
  if (driver.userId || driver.user) {
    return NextResponse.json({ error: 'Driver already has a linked login account' }, { status: 409 })
  }

  const email = normalizeDriverLoginEmail(driver.email)
  if (!email) {
    return NextResponse.json({ error: 'Driver email is required before creating a login account' }, { status: 400 })
  }

  const initialPassword = resolveDriverInitialPassword(parsed.data.initialPassword)
  const hashedPassword = await hashDriverPassword(initialPassword)
  const generated = !parsed.data.initialPassword

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email },
        include: { driver: { select: { id: true } } },
      })

      if (existingUser) {
        if (!canLinkExistingUserToDriver(existingUser)) {
          throw new Error('DRIVER_LOGIN_LINK_NOT_ALLOWED')
        }
        if (!parsed.data.linkExistingUser) {
          throw new Error('DRIVER_LOGIN_LINK_CONFIRMATION_REQUIRED')
        }

        const user = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name: driver.name,
            phone: driver.phone,
            role: 'driver',
            ...(parsed.data.resetExistingPassword || !existingUser.hashedPassword
              ? {
                  hashedPassword,
                  emailVerified: existingUser.emailVerified ?? new Date(),
                  sessionVersion: { increment: 1 },
                }
              : {}),
          },
          select: { id: true, email: true, role: true, disabledAt: true },
        })

        await tx.mobileSession.updateMany({
          where: { userId: existingUser.id, revokedAt: null },
          data: { revokedAt: new Date() },
        })

        const linkedDriver = await tx.driver.update({
          where: { id: driver.id },
          data: { userId: user.id, email },
          include: { user: { select: { id: true, email: true, role: true, disabledAt: true } } },
        })
        return {
          driver: linkedDriver,
          credentials:
            parsed.data.resetExistingPassword || !existingUser.hashedPassword
              ? { email, temporaryPassword: initialPassword, generated }
              : null,
          linkedExistingUser: true,
        }
      }

      const user = await tx.user.create({
        data: {
          name: driver.name,
          email,
          emailVerified: new Date(),
          phone: driver.phone,
          hashedPassword,
          role: 'driver',
        },
        select: { id: true },
      })

      const linkedDriver = await tx.driver.update({
        where: { id: driver.id },
        data: { userId: user.id, email },
        include: { user: { select: { id: true, email: true, role: true, disabledAt: true } } },
      })

      return {
        driver: linkedDriver,
        credentials: { email, temporaryPassword: initialPassword, generated },
        linkedExistingUser: false,
      }
    })

    await writeAuditLog({
      session: guard.session,
      req,
      action: result.linkedExistingUser ? 'link_driver_login' : 'create_driver_login',
      entityType: 'driver',
      entityId: driver.id,
      metadata: {
        email,
        linkedExistingUser: result.linkedExistingUser,
        temporaryPasswordReturned: Boolean(result.credentials),
      },
    })

    return NextResponse.json({
      driver: sanitizeDriverForAdmin(result.driver),
      credentials: result.credentials,
      linkedExistingUser: result.linkedExistingUser,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'DRIVER_LOGIN_LINK_CONFIRMATION_REQUIRED') {
      return NextResponse.json(
        { error: 'A user account already exists for this email. Confirm explicit linking to continue.', code: 'LINK_CONFIRMATION_REQUIRED' },
        { status: 409 }
      )
    }
    if (error instanceof Error && error.message === 'DRIVER_LOGIN_LINK_NOT_ALLOWED') {
      return NextResponse.json(
        { error: 'This email cannot be linked because it belongs to an admin or another driver account.' },
        { status: 409 }
      )
    }
    const uniqueTarget = uniqueConstraintTarget(error)
    if (uniqueTarget) {
      return NextResponse.json({ error: `A record with this ${uniqueTarget} already exists` }, { status: 409 })
    }
    throw error
  }
}
