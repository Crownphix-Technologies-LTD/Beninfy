import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyFleetVehicleChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional()
)

const patchSchema = z.object({
  vehicleId: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).max(120).optional(),
  plateNumber: z.string().trim().min(1).max(40).optional(),
  color: optionalText,
  status: z.enum(['available', 'maintenance', 'inactive']).optional(),
  currentCity: optionalText,
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
    const current = await prisma.fleetVehicle.findUnique({ where: { id } })
    const fleetVehicle = await prisma.fleetVehicle.update({ where: { id }, data: parsed.data })
    await notifyFleetVehicleChanged('updated', [
      ['Label', fleetVehicle.label],
      ['Plate number', fleetVehicle.plateNumber],
      ['Color', fleetVehicle.color],
      ['Category ID', fleetVehicle.vehicleId],
      ['Status', fleetVehicle.status],
      ['Current city', fleetVehicle.currentCity],
    ])
    await writeAuditLog({
      session: guard.session,
      req,
      action: 'update',
      entityType: 'fleet_vehicle',
      entityId: fleetVehicle.id,
      metadata: { previous: current, next: fleetVehicle },
    })
    return NextResponse.json({ fleetVehicle })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ error: 'A fleet unit with this plate number already exists' }, { status: 409 })
      }
      if (error.code === 'P2003') {
        return NextResponse.json({ error: 'Selected vehicle type does not exist' }, { status: 400 })
      }
      if (error.code === 'P2025') {
        return NextResponse.json({ error: 'Fleet unit not found. Please refresh and try again.' }, { status: 404 })
      }
    }
    throw error
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const assignedLegs = await prisma.bookingLeg.count({ where: { fleetVehicleId: id } })
  if (assignedLegs > 0) {
    return NextResponse.json({ error: 'Cannot delete: this fleet vehicle has assigned booking legs.' }, { status: 409 })
  }
  try {
    const fleetVehicle = await prisma.fleetVehicle.findUnique({ where: { id } })
    await prisma.fleetVehicle.delete({ where: { id } })
    await notifyFleetVehicleChanged('deleted', [
      ['Label', fleetVehicle?.label],
      ['Plate number', fleetVehicle?.plateNumber],
      ['Color', fleetVehicle?.color],
      ['Category ID', fleetVehicle?.vehicleId],
    ])
    await writeAuditLog({
      session: guard.session,
      req,
      action: 'delete',
      entityType: 'fleet_vehicle',
      entityId: id,
      metadata: { previous: fleetVehicle },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Fleet unit not found. Please refresh and try again.' }, { status: 404 })
    }
    throw error
  }
}
