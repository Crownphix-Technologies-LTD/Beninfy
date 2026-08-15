export const BOOKING_LEG_STATUSES = [
  'payment_pending',
  'reserved',
  'unassigned',
  'assigned',
  'dispatched',
  'driver_en_route',
  'driver_arrived',
  'passenger_onboard',
  'in_progress',
  'completed',
  'cancelled',
] as const

export type BookingLegStatus = (typeof BOOKING_LEG_STATUSES)[number]

export const TERMINAL_LEG_STATUSES = ['completed', 'cancelled'] as const
export const NON_BLOCKING_LEG_STATUSES: BookingLegStatus[] = [
  'payment_pending',
  'cancelled',
  'completed',
]
export const ACTIVE_BLOCKING_LEG_STATUSES: BookingLegStatus[] = [
  'reserved',
  'unassigned',
  'assigned',
  'dispatched',
  'driver_en_route',
  'driver_arrived',
  'passenger_onboard',
  'in_progress',
]

export const DRIVER_TRIP_ACTIONS = [
  'accept',
  'decline',
  'start_en_route',
  'dispatch',
  'arrive',
  'passenger_onboard',
  'start_trip',
  'complete',
  'cancel',
] as const

export type DriverTripAction = (typeof DRIVER_TRIP_ACTIONS)[number]

export type CustomerLegState =
  | 'awaiting_payment'
  | 'confirmed'
  | 'driver_assigned'
  | 'driver_on_the_way'
  | 'driver_arrived'
  | 'passenger_onboard'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type DriverLegState =
  | 'awaiting_assignment'
  | 'assigned'
  | 'en_route_to_pickup'
  | 'at_pickup'
  | 'passenger_onboard'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

type TransitionRule = {
  from: BookingLegStatus[]
  to: BookingLegStatus
  driverRequired: boolean
  vehicleRequired: boolean
  bookingConfirmedRequired: boolean
  terminal?: boolean
  idempotentWhenAlready?: BookingLegStatus[]
  releaseDriver?: boolean
  timestampField?:
    | 'acceptedAt'
    | 'declinedAt'
    | 'enRouteAt'
    | 'arrivedAt'
    | 'passengerOnboardAt'
    | 'startedAt'
    | 'completedAt'
    | 'cancelledAt'
}

export const DRIVER_ACTION_TRANSITIONS: Record<DriverTripAction, TransitionRule> = {
  accept: {
    from: ['assigned'],
    to: 'assigned',
    driverRequired: true,
    vehicleRequired: false,
    bookingConfirmedRequired: true,
    idempotentWhenAlready: ['assigned'],
    timestampField: 'acceptedAt',
  },
  decline: {
    from: ['assigned', 'driver_en_route'],
    to: 'unassigned',
    driverRequired: true,
    vehicleRequired: false,
    bookingConfirmedRequired: true,
    releaseDriver: true,
    timestampField: 'declinedAt',
  },
  start_en_route: {
    from: ['assigned'],
    to: 'driver_en_route',
    driverRequired: true,
    vehicleRequired: true,
    bookingConfirmedRequired: true,
    idempotentWhenAlready: ['driver_en_route'],
    timestampField: 'enRouteAt',
  },
  // Backward-compatible alias for the older mobile contract.
  dispatch: {
    from: ['assigned'],
    to: 'driver_en_route',
    driverRequired: true,
    vehicleRequired: true,
    bookingConfirmedRequired: true,
    idempotentWhenAlready: ['driver_en_route'],
    timestampField: 'enRouteAt',
  },
  arrive: {
    from: ['driver_en_route', 'dispatched'],
    to: 'driver_arrived',
    driverRequired: true,
    vehicleRequired: true,
    bookingConfirmedRequired: true,
    idempotentWhenAlready: ['driver_arrived'],
    timestampField: 'arrivedAt',
  },
  passenger_onboard: {
    from: ['driver_arrived'],
    to: 'passenger_onboard',
    driverRequired: true,
    vehicleRequired: true,
    bookingConfirmedRequired: true,
    idempotentWhenAlready: ['passenger_onboard'],
    timestampField: 'passengerOnboardAt',
  },
  start_trip: {
    from: ['passenger_onboard'],
    to: 'in_progress',
    driverRequired: true,
    vehicleRequired: true,
    bookingConfirmedRequired: true,
    idempotentWhenAlready: ['in_progress'],
    timestampField: 'startedAt',
  },
  complete: {
    from: ['in_progress'],
    to: 'completed',
    driverRequired: true,
    vehicleRequired: true,
    bookingConfirmedRequired: true,
    terminal: true,
    idempotentWhenAlready: ['completed'],
    timestampField: 'completedAt',
  },
  cancel: {
    from: ['assigned', 'driver_en_route', 'driver_arrived'],
    to: 'unassigned',
    driverRequired: true,
    vehicleRequired: false,
    bookingConfirmedRequired: true,
    releaseDriver: true,
    timestampField: 'declinedAt',
  },
}

export function isBookingLegStatus(value: string): value is BookingLegStatus {
  return (BOOKING_LEG_STATUSES as readonly string[]).includes(value)
}

export function isDriverTripAction(value: string): value is DriverTripAction {
  return (DRIVER_TRIP_ACTIONS as readonly string[]).includes(value)
}

export function isTerminalLegStatus(status: string) {
  return (TERMINAL_LEG_STATUSES as readonly string[]).includes(status)
}

export function isVehicleBlockingLegStatus(status: string) {
  return !NON_BLOCKING_LEG_STATUSES.includes(status as BookingLegStatus)
}

export function customerLegState(status: string): CustomerLegState {
  switch (status) {
    case 'payment_pending':
      return 'awaiting_payment'
    case 'reserved':
    case 'unassigned':
      return 'confirmed'
    case 'assigned':
      return 'driver_assigned'
    case 'dispatched':
    case 'driver_en_route':
      return 'driver_on_the_way'
    case 'driver_arrived':
      return 'driver_arrived'
    case 'passenger_onboard':
      return 'passenger_onboard'
    case 'in_progress':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'confirmed'
  }
}

export function driverLegState(status: string): DriverLegState {
  switch (status) {
    case 'assigned':
      return 'assigned'
    case 'dispatched':
    case 'driver_en_route':
      return 'en_route_to_pickup'
    case 'driver_arrived':
      return 'at_pickup'
    case 'passenger_onboard':
      return 'passenger_onboard'
    case 'in_progress':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'awaiting_assignment'
  }
}

export function allowedDriverTripActions({
  status,
  hasDriver,
  hasFleetVehicle,
  bookingStatus,
}: {
  status: string
  hasDriver: boolean
  hasFleetVehicle: boolean
  bookingStatus: string
}) {
  return DRIVER_TRIP_ACTIONS.filter((action) => {
    const result = evaluateDriverTripTransition({
      status,
      action,
      hasDriver,
      hasFleetVehicle,
      bookingStatus,
    })
    return result.ok
  })
}

export function evaluateDriverTripTransition({
  status,
  action,
  hasDriver,
  hasFleetVehicle,
  bookingStatus,
}: {
  status: string
  action: DriverTripAction
  hasDriver: boolean
  hasFleetVehicle: boolean
  bookingStatus: string
}) {
  const rule = DRIVER_ACTION_TRANSITIONS[action]
  if (!isBookingLegStatus(status)) {
    return {
      ok: false as const,
      code: 'INVALID_TRANSITION' as const,
      message: `Unknown trip status ${status}`,
    }
  }

  if (isTerminalLegStatus(status) && !rule.idempotentWhenAlready?.includes(status)) {
    return {
      ok: false as const,
      code:
        status === 'completed' ? ('TRIP_ALREADY_COMPLETED' as const) : ('TRIP_TERMINAL' as const),
      message: 'Trip is already in a terminal state',
    }
  }

  if (
    rule.bookingConfirmedRequired &&
    bookingStatus !== 'confirmed' &&
    bookingStatus !== 'completed'
  ) {
    return {
      ok: false as const,
      code: 'PAYMENT_REQUIRED' as const,
      message: 'Booking must be confirmed before driver trip actions',
    }
  }

  if (rule.driverRequired && !hasDriver) {
    return {
      ok: false as const,
      code: 'DRIVER_NOT_ASSIGNED' as const,
      message: 'A driver must be assigned first',
    }
  }

  if (rule.vehicleRequired && !hasFleetVehicle) {
    return {
      ok: false as const,
      code: 'VEHICLE_NOT_ASSIGNED' as const,
      message: 'A fleet vehicle must be assigned first',
    }
  }

  if (rule.from.includes(status)) {
    return {
      ok: true as const,
      nextStatus: rule.to,
      idempotent: false,
      releaseDriver: Boolean(rule.releaseDriver),
      timestampField: rule.timestampField,
    }
  }

  if (rule.idempotentWhenAlready?.includes(status)) {
    return {
      ok: true as const,
      nextStatus: status,
      idempotent: true,
      releaseDriver: false,
      timestampField: undefined,
    }
  }

  return {
    ok: false as const,
    code: 'ACTION_NOT_ALLOWED' as const,
    message: `Cannot ${action} a trip with status ${status}`,
  }
}

export function shouldCompleteBooking(legStatuses: string[]) {
  return legStatuses.length > 0 && legStatuses.every((status) => status === 'completed')
}
