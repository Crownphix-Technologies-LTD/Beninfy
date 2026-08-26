import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import {
  hashDriverPassword,
  normalizeDriverLoginEmail,
  resolveDriverInitialPassword,
  sanitizeDriverForAdmin,
  uniqueConstraintTarget,
} from '@/lib/admin/driverProvisioning'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyDriverChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional()
)

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email(),
  initialPassword: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      z.string().trim().min(8).max(100).nullable().optional()
    ),
  status: z.enum(['available', 'off_duty', 'inactive']).default('available'),
  homeCity: optionalText,
  licenseNumber: optionalText,
  notes: optionalText,
})

export async function GET() {
  const guard = await requireAdminPermission('drivers')
  if (!guard.ok) return guard.response
  const drivers = await prisma.driver.findMany({
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: { user: { select: { id: true, email: true, role: true, disabledAt: true } } },
  })
  return NextResponse.json({ drivers: drivers.map(sanitizeDriverForAdmin) })
}

export async function POST(req: Request) {
  const guard = await requireAdminPermission('drivers')
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  try {
    const email = normalizeDriverLoginEmail(parsed.data.email)
    if (!email) return NextResponse.json({ error: 'Driver login email is required' }, { status: 400 })

    const temporaryPassword = resolveDriverInitialPassword(parsed.data.initialPassword)
    const hashedPassword = await hashDriverPassword(temporaryPassword)
    const generated = !parsed.data.initialPassword
    const driverData = {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email,
      status: parsed.data.status,
      homeCity: parsed.data.homeCity,
      licenseNumber: parsed.data.licenseNumber,
      notes: parsed.data.notes,
    }
    const driver = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      })
      if (existing) {
        throw new Error('DRIVER_EMAIL_ALREADY_REGISTERED')
      }

      const user = await tx.user.create({
        data: {
          name: driverData.name,
          email,
          emailVerified: new Date(),
          phone: driverData.phone,
          hashedPassword,
          role: 'driver',
        },
      })

      return tx.driver.create({
        data: {
          ...driverData,
          email,
          userId: user.id,
        },
        include: { user: { select: { id: true, email: true, role: true, disabledAt: true } } },
      })
    })
    await notifyDriverChanged('created', [
      ['Name', driver.name],
      ['Phone', driver.phone],
      ['Email', driver.email],
      ['Status', driver.status],
      ['Home city', driver.homeCity],
      ['License number', driver.licenseNumber],
    ])
    await writeAuditLog({
      session: guard.session,
      req,
      action: 'create',
      entityType: 'driver',
      entityId: driver.id,
      metadata: {
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        status: driver.status,
        homeCity: driver.homeCity,
        loginAccountCreated: true,
      },
    })
    return NextResponse.json(
      {
        driver: sanitizeDriverForAdmin(driver),
        credentials: {
          email,
          temporaryPassword,
          generated,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'DRIVER_EMAIL_ALREADY_REGISTERED') {
      return NextResponse.json(
        { error: 'Email already belongs to an existing account. Use Create login on an existing unlinked driver if this is intentional.' },
        { status: 409 }
      )
    }
    const uniqueTarget = uniqueConstraintTarget(error)
    if (uniqueTarget) {
      return NextResponse.json({ error: `A driver with this ${uniqueTarget} already exists` }, { status: 409 })
    }
    throw error
  }
}
