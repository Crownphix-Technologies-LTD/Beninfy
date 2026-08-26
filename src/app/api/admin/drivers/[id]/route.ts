import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import {
  normalizeDriverLoginEmail,
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

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().email().nullable().optional()
  ),
  status: z.enum(['available', 'off_duty', 'inactive']).optional(),
  homeCity: optionalText,
  licenseNumber: optionalText,
  notes: optionalText,
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('drivers')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  try {
    const current = await prisma.driver.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, role: true, disabledAt: true } } },
    })
    if (!current) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    const nextEmail =
      parsed.data.email === undefined ? current.email : normalizeDriverLoginEmail(parsed.data.email)
    if (current.userId && !nextEmail) {
      return NextResponse.json({ error: 'Linked driver login requires an email address' }, { status: 400 })
    }

    const driver = await prisma.$transaction(async (tx) => {
      if (current.userId) {
        await tx.user.update({
          where: { id: current.userId },
          data: {
            ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
            ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
            ...(nextEmail && nextEmail !== current.user?.email ? { email: nextEmail } : {}),
          },
        })
      }
      return tx.driver.update({
        where: { id },
        data: {
          ...parsed.data,
          ...(parsed.data.email !== undefined ? { email: nextEmail } : {}),
        },
        include: { user: { select: { id: true, email: true, role: true, disabledAt: true } } },
      })
    })
    await notifyDriverChanged('updated', [
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
      action: 'update',
      entityType: 'driver',
      entityId: driver.id,
      metadata: { previous: current, next: driver },
    })
    return NextResponse.json({ driver: sanitizeDriverForAdmin(driver) })
  } catch (error) {
    const uniqueTarget = uniqueConstraintTarget(error)
    if (uniqueTarget) {
      return NextResponse.json({ error: `A driver with this ${uniqueTarget} already exists` }, { status: 409 })
    }
    throw error
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('drivers')
  if (!guard.ok) return guard.response
  const { id } = await params
  const assignedLegs = await prisma.bookingLeg.count({ where: { driverId: id } })
  if (assignedLegs > 0) {
    return NextResponse.json({ error: 'Cannot delete: this driver has assigned booking legs.' }, { status: 409 })
  }
  const driver = await prisma.driver.findUnique({ where: { id } })
  await prisma.driver.delete({ where: { id } })
  await notifyDriverChanged('deleted', [
    ['Name', driver?.name],
    ['Phone', driver?.phone],
    ['Email', driver?.email],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'delete',
    entityType: 'driver',
    entityId: id,
    metadata: { previous: driver },
  })
  return NextResponse.json({ ok: true })
}
