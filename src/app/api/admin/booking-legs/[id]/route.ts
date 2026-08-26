import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import {
  markDriverAssignmentCompleted,
  markDriverAssignmentReleased,
  recordDriverAssignmentChange,
} from '@/lib/mobile/driverAssignmentHistory'
import { canDriverReceiveNewAssignment } from '@/lib/mobile/driverOperations'
import { notifyTripLifecyclePush } from '@/lib/mobile/notifications'
import { notifyBookingAssignmentChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { BOOKING_LEG_STATUSES, NON_BLOCKING_LEG_STATUSES } from '@/lib/tripLifecycle'

const patchSchema = z.object({
  fleetVehicleId: z.string().nullable().optional(),
  driverId: z.string().nullable().optional(),
  status: z.enum(BOOKING_LEG_STATUSES).optional(),
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
  const guard = await requireAdminPermission('bookings')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten() },
      { status: 400 }
    )

  const leg = await prisma.bookingLeg.findUnique({ where: { id } })
  if (!leg) return NextResponse.json({ error: 'Booking leg not found' }, { status: 404 })

  const { startsAt, endsAt } = dayWindow(leg.departureDate)
  const data = parsed.data

  if (data.fleetVehicleId) {
    const fleetVehicle = await prisma.fleetVehicle.findUnique({
      where: { id: data.fleetVehicleId },
    })
    if (!fleetVehicle || fleetVehicle.vehicleId !== leg.vehicleId) {
      return NextResponse.json(
        { error: 'Fleet vehicle does not match the booked vehicle type' },
        { status: 400 }
      )
    }
    if (fleetVehicle.status !== 'available') {
      return NextResponse.json({ error: 'Fleet vehicle is not available' }, { status: 409 })
    }
    const conflict = await prisma.bookingLeg.findFirst({
      where: {
        id: { not: id },
        fleetVehicleId: data.fleetVehicleId,
        departureDate: { gte: startsAt, lte: endsAt },
        status: { notIn: NON_BLOCKING_LEG_STATUSES },
      },
    })
    if (conflict)
      return NextResponse.json(
        { error: 'Fleet vehicle is already assigned on this date' },
        { status: 409 }
      )
  }

  if (data.driverId) {
    const driver = await prisma.driver.findUnique({ where: { id: data.driverId } })
    if (!driver || !canDriverReceiveNewAssignment(driver.status)) {
      return NextResponse.json({ error: 'Driver is not available' }, { status: 409 })
    }
    const conflict = await prisma.bookingLeg.findFirst({
      where: {
        id: { not: id },
        driverId: data.driverId,
        departureDate: { gte: startsAt, lte: endsAt },
        status: { notIn: NON_BLOCKING_LEG_STATUSES },
      },
    })
    if (conflict)
      return NextResponse.json(
        { error: 'Driver is already assigned on this date' },
        { status: 409 }
      )
  }

  const now = new Date()
  const nextStatus = data.status ?? (data.fleetVehicleId || data.driverId ? 'assigned' : undefined)
  const bookingLeg = await prisma.$transaction(async (tx) => {
    const updated = await tx.bookingLeg.update({
      where: { id },
      data: {
        fleetVehicleId: data.fleetVehicleId,
        driverId: data.driverId,
        status: nextStatus,
        assignedAt:
          data.driverId || nextStatus === 'assigned' ? (leg.assignedAt ?? now) : undefined,
        completedAt: nextStatus === 'completed' ? (leg.completedAt ?? now) : undefined,
        cancelledAt: nextStatus === 'cancelled' ? (leg.cancelledAt ?? now) : undefined,
        cancelledBy: nextStatus === 'cancelled' ? 'admin' : undefined,
        notes: data.notes,
      },
      include: {
        fleetVehicle: true,
        driver: true,
      },
    })

    if (data.driverId !== undefined) {
      await recordDriverAssignmentChange({
        tx,
        bookingLegId: leg.id,
        previousDriverId: leg.driverId,
        nextDriverId: data.driverId,
        assignedAt:
          data.driverId && data.driverId !== leg.driverId ? now : (updated.assignedAt ?? now),
        occurredAt: now,
        releaseReason: data.driverId ? 'reassigned' : 'admin_released',
        releaseSource: 'admin',
      })
    }

    if (updated.driverId && nextStatus === 'completed') {
      await markDriverAssignmentCompleted({
        tx,
        bookingLegId: updated.id,
        driverId: updated.driverId,
        completedAt: updated.completedAt ?? now,
      })
    } else if ((updated.driverId || leg.driverId) && nextStatus === 'cancelled') {
      await markDriverAssignmentReleased({
        tx,
        bookingLegId: updated.id,
        driverId: updated.driverId ?? leg.driverId!,
        releasedAt: updated.cancelledAt ?? now,
        releaseReason: 'admin_cancelled',
        releaseSource: 'admin',
      })
    }

    return updated
  })

  if (
    data.fleetVehicleId !== undefined ||
    data.driverId !== undefined ||
    data.status !== undefined ||
    data.notes !== undefined
  ) {
    await notifyBookingAssignmentChanged(bookingLeg.id, leg.driverId)
    if (data.status !== undefined && data.status !== leg.status) {
      await notifyTripLifecyclePush({
        bookingId: bookingLeg.bookingId,
        bookingLegId: bookingLeg.id,
        nextStatus: bookingLeg.status,
        driverId: bookingLeg.driverId,
      }).catch((error) => {
        console.warn('Admin trip lifecycle push notification failed', {
          bookingLegId: bookingLeg.id,
          nextStatus: bookingLeg.status,
          error: error instanceof Error ? error.message : 'unknown',
        })
      })
    }
  }

  if (bookingLeg.status === 'completed') {
    const incompleteLegs = await prisma.bookingLeg.count({
      where: {
        bookingId: bookingLeg.bookingId,
        status: { not: 'completed' },
      },
    })
    if (incompleteLegs === 0) {
      await prisma.booking.updateMany({
        where: {
          id: bookingLeg.bookingId,
          status: { notIn: ['cancelled', 'completed'] },
        },
        data: { status: 'completed' },
      })
    }
  }

  return NextResponse.json({ bookingLeg })
}
