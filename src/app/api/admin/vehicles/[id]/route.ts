import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  nameFr: z.string().nullable().optional(),
  capacity: z.number().int().positive().optional(),
  luggageCapacity: z.number().int().nonnegative().optional(),
  available: z.boolean().optional(),
  image: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionFr: z.string().nullable().optional(),
  badge: z.string().nullable().optional(),
  badgeFr: z.string().nullable().optional(),
  features: z.array(z.string()).optional(),
  featuresFr: z.array(z.string()).optional(),
  basePriceNGN: z.number().int().positive().nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  try {
    const vehicle = await prisma.vehicle.update({ where: { id }, data: parsed.data })
    await notifyBackofficeRecordChanged('Vehicle category', 'updated', [
      ['ID', vehicle.id],
      ['Name', vehicle.name],
      ['Capacity', vehicle.capacity],
      ['Available', vehicle.available ? 'Yes' : 'No'],
      ['Base price', vehicle.basePriceNGN ? `NGN ${vehicle.basePriceNGN.toLocaleString()}` : null],
    ])
    return NextResponse.json({ vehicle })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Vehicle not found. Please refresh and try again.' }, { status: 404 })
    }
    throw error
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const [bookingCount, fleetVehicleCount, bookingLegCount] = await Promise.all([
    prisma.booking.count({ where: { vehicleId: id } }),
    prisma.fleetVehicle.count({ where: { vehicleId: id } }),
    prisma.bookingLeg.count({ where: { vehicleId: id } }),
  ])

  const blockers = [
    bookingCount > 0 ? `${bookingCount} booking${bookingCount === 1 ? '' : 's'}` : null,
    fleetVehicleCount > 0 ? `${fleetVehicleCount} fleet unit${fleetVehicleCount === 1 ? '' : 's'}` : null,
    bookingLegCount > 0 ? `${bookingLegCount} booking leg${bookingLegCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean)

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete this vehicle category because it is linked to ${blockers.join(', ')}. Mark it unavailable instead, or move/delete the linked records first.`,
      },
      { status: 409 }
    )
  }

  try {
    const vehicle = await prisma.vehicle.findUnique({ where: { id } })
    await prisma.$transaction([
      prisma.routePrice.deleteMany({ where: { vehicleId: id } }),
      prisma.vehicle.delete({ where: { id } }),
    ])
    await notifyBackofficeRecordChanged('Vehicle category', 'deleted', [
      ['ID', vehicle?.id],
      ['Name', vehicle?.name],
      ['Capacity', vehicle?.capacity],
    ])
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Vehicle not found. Please refresh and try again.' }, { status: 404 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json(
        { error: 'Cannot delete this vehicle category because it is still linked to operational records. Mark it unavailable instead.' },
        { status: 409 }
      )
    }
    throw error
  }
}
