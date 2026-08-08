import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { notifyBookingAssignmentChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  fleetVehicleId: z.string().nullable().optional(),
  driverId: z.string().nullable().optional(),
  status: z.enum(['payment_pending', 'reserved', 'unassigned', 'assigned', 'dispatched', 'completed', 'cancelled']).optional(),
  notes: z.string().nullable().optional(),
})

function dayWindow(date: Date) {
  const startsAt = new Date(date)
  startsAt.setHours(0, 0, 0, 0)
  const endsAt = new Date(date)
  endsAt.setHours(23, 59, 59, 999)
  return { startsAt, endsAt }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })

  const leg = await prisma.bookingLeg.findUnique({ where: { id } })
  if (!leg) return NextResponse.json({ error: 'Booking leg not found' }, { status: 404 })

  const { startsAt, endsAt } = dayWindow(leg.departureDate)
  const data = parsed.data

  if (data.fleetVehicleId) {
    const fleetVehicle = await prisma.fleetVehicle.findUnique({ where: { id: data.fleetVehicleId } })
    if (!fleetVehicle || fleetVehicle.vehicleId !== leg.vehicleId) {
      return NextResponse.json({ error: 'Fleet vehicle does not match the booked vehicle type' }, { status: 400 })
    }
    if (fleetVehicle.status !== 'available') {
      return NextResponse.json({ error: 'Fleet vehicle is not available' }, { status: 409 })
    }
    const conflict = await prisma.bookingLeg.findFirst({
      where: {
        id: { not: id },
        fleetVehicleId: data.fleetVehicleId,
        departureDate: { gte: startsAt, lte: endsAt },
        status: { notIn: ['payment_pending', 'cancelled', 'completed'] },
      },
    })
    if (conflict) return NextResponse.json({ error: 'Fleet vehicle is already assigned on this date' }, { status: 409 })
  }

  if (data.driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: data.driverId } })
    if (!driver || driver.status !== 'available') {
      return NextResponse.json({ error: 'Driver is not available' }, { status: 409 })
    }
    const conflict = await prisma.bookingLeg.findFirst({
      where: {
        id: { not: id },
        driverId: data.driverId,
        departureDate: { gte: startsAt, lte: endsAt },
        status: { notIn: ['payment_pending', 'cancelled', 'completed'] },
      },
    })
    if (conflict) return NextResponse.json({ error: 'Driver is already assigned on this date' }, { status: 409 })
  }

  const bookingLeg = await prisma.bookingLeg.update({
    where: { id },
    data: {
      fleetVehicleId: data.fleetVehicleId,
      driverId: data.driverId,
      status: data.status ?? (data.fleetVehicleId || data.driverId ? 'assigned' : undefined),
      notes: data.notes,
    },
    include: {
      fleetVehicle: true,
      driver: true,
    },
  })

  if (
    data.fleetVehicleId !== undefined ||
    data.driverId !== undefined ||
    data.status !== undefined ||
    data.notes !== undefined
  ) {
    await notifyBookingAssignmentChanged(bookingLeg.id)
  }

  return NextResponse.json({ bookingLeg })
}
