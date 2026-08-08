import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
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
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  try {
    const driver = await prisma.driver.update({ where: { id }, data: parsed.data })
    await notifyDriverChanged('updated', [
      ['Name', driver.name],
      ['Phone', driver.phone],
      ['Email', driver.email],
      ['Status', driver.status],
      ['Home city', driver.homeCity],
      ['License number', driver.licenseNumber],
    ])
    return NextResponse.json({ driver })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A driver with this unique value already exists' }, { status: 409 })
    }
    throw error
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
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
  return NextResponse.json({ ok: true })
}
