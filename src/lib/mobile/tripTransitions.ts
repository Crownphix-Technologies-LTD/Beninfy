import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/auditLog'
import type { MobilePrincipal } from '@/lib/mobile/auth'

export type DriverTripAction = 'accept' | 'dispatch' | 'complete' | 'cancel'

type TransitionResult =
  | { ok: true; previousStatus: string; nextStatus: string }
  | {
      ok: false
      code:
        | 'TRIP_NOT_FOUND'
        | 'TRIP_NOT_ASSIGNED'
        | 'DRIVER_INACTIVE'
        | 'VEHICLE_NOT_ASSIGNED'
        | 'INVALID_TRANSITION'
      message: string
    }

const TERMINAL_STATUSES = new Set(['completed', 'cancelled'])

const NEXT_STATUS_BY_ACTION: Record<
  DriverTripAction,
  { from: string[]; to: string; vehicleRequired?: boolean }
> = {
  accept: { from: ['reserved', 'unassigned'], to: 'assigned' },
  dispatch: { from: ['assigned'], to: 'dispatched', vehicleRequired: true },
  complete: { from: ['dispatched'], to: 'completed', vehicleRequired: true },
  cancel: { from: ['reserved', 'unassigned', 'assigned', 'dispatched'], to: 'cancelled' },
}

export function isDriverTripAction(value: string): value is DriverTripAction {
  return value in NEXT_STATUS_BY_ACTION
}

export function evaluateDriverTripTransition({
  status,
  action,
  hasFleetVehicle,
}: {
  status: string
  action: DriverTripAction
  hasFleetVehicle: boolean
}) {
  if (TERMINAL_STATUSES.has(status)) {
    return {
      ok: false as const,
      code: 'INVALID_TRANSITION' as const,
      message: 'Trip is already in a terminal state',
    }
  }

  const transition = NEXT_STATUS_BY_ACTION[action]
  if (!transition.from.includes(status)) {
    return {
      ok: false as const,
      code: 'INVALID_TRANSITION' as const,
      message: `Cannot ${action} a trip with status ${status}`,
    }
  }
  if (transition.vehicleRequired && !hasFleetVehicle) {
    return {
      ok: false as const,
      code: 'VEHICLE_NOT_ASSIGNED' as const,
      message: 'A fleet vehicle must be assigned first',
    }
  }

  return { ok: true as const, nextStatus: transition.to }
}

export async function applyDriverTripAction({
  req,
  principal,
  bookingLegId,
  action,
}: {
  req: Request
  principal: MobilePrincipal
  bookingLegId: string
  action: DriverTripAction
}): Promise<TransitionResult> {
  const leg = await prisma.bookingLeg.findUnique({
    where: { id: bookingLegId },
    include: {
      driver: true,
    },
  })
  if (!leg) return { ok: false, code: 'TRIP_NOT_FOUND', message: 'Trip not found' }
  if (!principal.driverId || leg.driverId !== principal.driverId) {
    return { ok: false, code: 'TRIP_NOT_ASSIGNED', message: 'Trip is not assigned to this driver' }
  }
  if (!leg.driver || leg.driver.status !== 'available') {
    return { ok: false, code: 'DRIVER_INACTIVE', message: 'Driver is not active' }
  }
  const transition = evaluateDriverTripTransition({
    status: leg.status,
    action,
    hasFleetVehicle: Boolean(leg.fleetVehicleId),
  })
  if (!transition.ok) return transition

  const transitionRule = NEXT_STATUS_BY_ACTION[action]
  const update = await prisma.bookingLeg.updateMany({
    where: {
      id: leg.id,
      driverId: principal.driverId,
      status: { in: transitionRule.from },
      ...(transitionRule.vehicleRequired ? { fleetVehicleId: { not: null } } : {}),
    },
    data: { status: transition.nextStatus },
  })
  if (update.count !== 1) {
    const current = await prisma.bookingLeg.findUnique({
      where: { id: leg.id },
      select: { status: true, fleetVehicleId: true },
    })
    if (!current) return { ok: false, code: 'TRIP_NOT_FOUND', message: 'Trip not found' }
    const currentTransition = evaluateDriverTripTransition({
      status: current.status,
      action,
      hasFleetVehicle: Boolean(current.fleetVehicleId),
    })
    if (!currentTransition.ok) return currentTransition
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
      driverId: principal.driverId,
      previousStatus: leg.status,
      nextStatus: transition.nextStatus,
    },
  })

  return { ok: true, previousStatus: leg.status, nextStatus: transition.nextStatus }
}
