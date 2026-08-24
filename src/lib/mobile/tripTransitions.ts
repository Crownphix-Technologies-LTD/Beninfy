import { Prisma } from '@prisma/client'
import { writeAuditLog } from '@/lib/auditLog'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import { notifyTripLifecyclePush } from '@/lib/mobile/notifications'
import {
  markDriverAssignmentAccepted,
  markDriverAssignmentCompleted,
  markDriverAssignmentDeclined,
  markDriverAssignmentReleased,
} from '@/lib/mobile/driverAssignmentHistory'
import { prisma } from '@/lib/prisma'
import {
  DRIVER_ACTION_TRANSITIONS,
  type DriverTripAction,
  allowedDriverTripActions,
  evaluateDriverTripTransition,
  isDriverTripAction,
  shouldCompleteBooking,
} from '@/lib/tripLifecycle'

export { evaluateDriverTripTransition, isDriverTripAction, type DriverTripAction }

type TransitionResult =
  | {
      ok: true
      previousStatus: string
      nextStatus: string
      allowedActions: DriverTripAction[]
      idempotent: boolean
      event: {
        type: 'booking_leg_transition'
        bookingId: string
        bookingLegId: string
        action: DriverTripAction
        previousStatus: string
        nextStatus: string
        actorType: 'driver'
        actorId: string
        driverId: string
      }
    }
  | { ok: false; code: MobileErrorCode; message: string }

type LifecycleTimestampField =
  | 'acceptedAt'
  | 'declinedAt'
  | 'enRouteAt'
  | 'arrivedAt'
  | 'passengerOnboardAt'
  | 'startedAt'
  | 'completedAt'
  | 'cancelledAt'

function timestampData(field: LifecycleTimestampField | undefined, now: Date) {
  return field ? { [field]: now } : {}
}

async function syncBookingCompletion(bookingId: string, tx: Prisma.TransactionClient) {
  const legs = await tx.bookingLeg.findMany({
    where: { bookingId },
    select: { status: true },
  })
  if (!shouldCompleteBooking(legs.map((leg) => leg.status))) return false

  await tx.booking.updateMany({
    where: {
      id: bookingId,
      status: { notIn: ['cancelled', 'completed'] },
    },
    data: { status: 'completed' },
  })
  return true
}

export async function applyDriverTripAction({
  req,
  principal,
  bookingLegId,
  action,
  reasonCode,
}: {
  req: Request
  principal: MobilePrincipal
  bookingLegId: string
  action: DriverTripAction
  reasonCode?: string | null
}): Promise<TransitionResult> {
  const leg = await prisma.bookingLeg.findUnique({
    where: { id: bookingLegId },
    include: {
      driver: true,
      booking: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  })
  if (!leg) return { ok: false, code: 'TRIP_NOT_FOUND', message: 'Trip not found' }
  if (!principal.driverId || leg.driverId !== principal.driverId) {
    return { ok: false, code: 'TRIP_NOT_ASSIGNED', message: 'Trip is not assigned to this driver' }
  }
  if (!leg.driver || leg.driver.status !== 'available') {
    return { ok: false, code: 'DRIVER_INACTIVE', message: 'Driver is not active' }
  }

  if (action === 'accept' && leg.status === 'assigned' && leg.acceptedAt) {
    return {
      ok: true,
      previousStatus: leg.status,
      nextStatus: leg.status,
      allowedActions: allowedDriverTripActions({
        status: leg.status,
        hasDriver: Boolean(leg.driverId),
        hasFleetVehicle: Boolean(leg.fleetVehicleId),
        bookingStatus: leg.booking.status,
      }),
      idempotent: true,
      event: {
        type: 'booking_leg_transition',
        bookingId: leg.bookingId,
        bookingLegId: leg.id,
        action,
        previousStatus: leg.status,
        nextStatus: leg.status,
        actorType: 'driver',
        actorId: principal.userId,
        driverId: principal.driverId,
      },
    }
  }

  const transition = evaluateDriverTripTransition({
    status: leg.status,
    action,
    hasDriver: Boolean(leg.driverId),
    hasFleetVehicle: Boolean(leg.fleetVehicleId),
    bookingStatus: leg.booking.status,
  })
  if (!transition.ok) return transition

  if (transition.idempotent) {
    return {
      ok: true,
      previousStatus: leg.status,
      nextStatus: leg.status,
      allowedActions: allowedDriverTripActions({
        status: leg.status,
        hasDriver: Boolean(leg.driverId),
        hasFleetVehicle: Boolean(leg.fleetVehicleId),
        bookingStatus: leg.booking.status,
      }),
      idempotent: true,
      event: {
        type: 'booking_leg_transition',
        bookingId: leg.bookingId,
        bookingLegId: leg.id,
        action,
        previousStatus: leg.status,
        nextStatus: leg.status,
        actorType: 'driver',
        actorId: principal.userId,
        driverId: principal.driverId,
      },
    }
  }

  const rule = DRIVER_ACTION_TRANSITIONS[action]
  const now = new Date()
  const updateData: Prisma.BookingLegUpdateManyMutationInput = {
    status: transition.nextStatus,
    ...timestampData(transition.timestampField, now),
    ...(transition.releaseDriver
      ? {
          driverId: null,
          declineReasonCode: reasonCode || undefined,
        }
      : {}),
  }

  const update = await prisma.$transaction(
    async (tx) => {
      const changed = await tx.bookingLeg.updateMany({
        where: {
          id: leg.id,
          driverId: principal.driverId,
          status: { in: rule.from },
          ...(rule.vehicleRequired ? { fleetVehicleId: { not: null } } : {}),
          ...(rule.bookingConfirmedRequired
            ? { booking: { is: { status: { in: ['confirmed', 'completed'] } } } }
            : {}),
        },
        data: updateData,
      })

      if (changed.count !== 1) return { changed: false as const, completedBooking: false }

      if (action === 'accept') {
        await markDriverAssignmentAccepted({
          tx,
          bookingLegId: leg.id,
          driverId: principal.driverId!,
          acceptedAt: now,
        })
      } else if (action === 'decline') {
        await markDriverAssignmentDeclined({
          tx,
          bookingLegId: leg.id,
          driverId: principal.driverId!,
          declinedAt: now,
          releaseReason: reasonCode,
        })
      } else if (action === 'cancel') {
        await markDriverAssignmentReleased({
          tx,
          bookingLegId: leg.id,
          driverId: principal.driverId!,
          releasedAt: now,
          releaseReason: reasonCode ?? 'driver_cancelled',
          releaseSource: 'driver',
        })
      } else if (transition.nextStatus === 'completed') {
        await markDriverAssignmentCompleted({
          tx,
          bookingLegId: leg.id,
          driverId: principal.driverId!,
          completedAt: now,
        })
      }

      const completedBooking =
        transition.nextStatus === 'completed'
          ? await syncBookingCompletion(leg.bookingId, tx)
          : false
      if (
        transition.releaseDriver ||
        transition.nextStatus === 'completed' ||
        transition.nextStatus === 'cancelled'
      ) {
        await tx.driverPresence.updateMany({
          where: {
            driverId: principal.driverId,
            currentBookingLegId: leg.id,
          },
          data: {
            currentBookingLegId: null,
            lastSeenAt: new Date(),
          },
        })
        await tx.latestTripLocation.updateMany({
          where: { bookingLegId: leg.id },
          data: { expiresAt: new Date() },
        })
      }
      return { changed: true as const, completedBooking }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )

  if (!update.changed) {
    const current = await prisma.bookingLeg.findUnique({
      where: { id: leg.id },
      select: {
        status: true,
        fleetVehicleId: true,
        driverId: true,
        booking: { select: { status: true } },
      },
    })
    if (!current) return { ok: false, code: 'TRIP_NOT_FOUND', message: 'Trip not found' }
    const currentTransition = evaluateDriverTripTransition({
      status: current.status,
      action,
      hasDriver: Boolean(current.driverId),
      hasFleetVehicle: Boolean(current.fleetVehicleId),
      bookingStatus: current.booking.status,
    })
    if (!currentTransition.ok) return currentTransition
    if (currentTransition.idempotent) {
      return {
        ok: true,
        previousStatus: current.status,
        nextStatus: current.status,
        allowedActions: allowedDriverTripActions({
          status: current.status,
          hasDriver: Boolean(current.driverId),
          hasFleetVehicle: Boolean(current.fleetVehicleId),
          bookingStatus: current.booking.status,
        }),
        idempotent: true,
        event: {
          type: 'booking_leg_transition',
          bookingId: leg.bookingId,
          bookingLegId: leg.id,
          action,
          previousStatus: current.status,
          nextStatus: current.status,
          actorType: 'driver',
          actorId: principal.userId,
          driverId: principal.driverId,
        },
      }
    }
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: 'Trip status changed while processing this action. Please refresh and try again.',
    }
  }

  await writeAuditLog({
    session: {
      user: {
        id: principal.userId,
        email: principal.email,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
    req,
    action: `driver_trip_${action}`,
    entityType: 'BookingLeg',
    entityId: leg.id,
    metadata: {
      actorType: 'driver',
      actorId: principal.userId,
      driverId: principal.driverId,
      bookingId: leg.bookingId,
      previousStatus: leg.status,
      nextStatus: transition.nextStatus,
      reasonCode: reasonCode || null,
      bookingCompleted: update.completedBooking,
    },
  })

  await notifyTripLifecyclePush({
    bookingId: leg.bookingId,
    bookingLegId: leg.id,
    nextStatus: transition.nextStatus,
    driverId: principal.driverId,
  }).catch((error) => {
    console.warn('Trip lifecycle push notification failed', {
      bookingLegId: leg.id,
      nextStatus: transition.nextStatus,
      error: error instanceof Error ? error.message : 'unknown',
    })
  })

  return {
    ok: true,
    previousStatus: leg.status,
    nextStatus: transition.nextStatus,
    allowedActions: allowedDriverTripActions({
      status: transition.nextStatus,
      hasDriver: !transition.releaseDriver,
      hasFleetVehicle: Boolean(leg.fleetVehicleId),
      bookingStatus: update.completedBooking ? 'completed' : leg.booking.status,
    }),
    idempotent: false,
    event: {
      type: 'booking_leg_transition',
      bookingId: leg.bookingId,
      bookingLegId: leg.id,
      action,
      previousStatus: leg.status,
      nextStatus: transition.nextStatus,
      actorType: 'driver',
      actorId: principal.userId,
      driverId: principal.driverId,
    },
  }
}
