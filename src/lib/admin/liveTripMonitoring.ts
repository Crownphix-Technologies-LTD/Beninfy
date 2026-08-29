export const ADMIN_LIVE_TRIP_POLL_INTERVAL_MS = 8000

export type AdminLegLifecycleStatus =
  | 'payment_pending'
  | 'reserved'
  | 'unassigned'
  | 'assigned'
  | 'dispatched'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'passenger_onboard'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type AdminLifecycleTimestamps = {
  assignedAt?: string | Date | null
  acceptedAt?: string | Date | null
  declinedAt?: string | Date | null
  enRouteAt?: string | Date | null
  arrivedAt?: string | Date | null
  passengerOnboardAt?: string | Date | null
  startedAt?: string | Date | null
  completedAt?: string | Date | null
  cancelledAt?: string | Date | null
}

export type AdminLatestLocation = {
  latitude: number
  longitude: number
  accuracyMeters?: number | null
  receivedAt: string | Date
  expiresAt: string | Date
} | null

export type AdminTimelineStep = {
  key:
    | 'assigned'
    | 'accepted'
    | 'en_route'
    | 'arrived'
    | 'passenger_onboard'
    | 'started'
    | 'completed'
    | 'cancelled'
  label: string
  timestamp: string | null
  state: 'complete' | 'current' | 'pending' | 'terminal'
}

const TERMINAL_STATUSES = new Set(['completed', 'cancelled'])
const MONITORABLE_STATUSES = new Set([
  'assigned',
  'dispatched',
  'driver_en_route',
  'driver_arrived',
  'passenger_onboard',
  'in_progress',
])

function timestampValue(value: string | Date | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function adminTripCurrentState({
  status,
  timestamps = {},
}: {
  status: string
  timestamps?: AdminLifecycleTimestamps
}) {
  if (status === 'assigned' && timestampValue(timestamps.acceptedAt)) return 'Driver accepted'

  switch (status) {
    case 'payment_pending':
      return 'Awaiting payment'
    case 'reserved':
      return 'Reserved'
    case 'unassigned':
      return 'Unassigned'
    case 'assigned':
      return 'Driver assigned'
    case 'dispatched':
    case 'driver_en_route':
      return 'Heading to pickup'
    case 'driver_arrived':
      return 'Driver arrived'
    case 'passenger_onboard':
      return 'Passenger onboard'
    case 'in_progress':
      return 'Trip in progress'
    case 'completed':
      return 'Trip completed'
    case 'cancelled':
      return 'Trip cancelled'
    default:
      return 'Unknown state'
  }
}

export function adminTripTimeline({
  status,
  timestamps = {},
}: {
  status: string
  timestamps?: AdminLifecycleTimestamps
}): AdminTimelineStep[] {
  const terminalCancelled = status === 'cancelled'
  const terminalCompleted = status === 'completed'
  const currentKey =
    status === 'assigned' && timestampValue(timestamps.acceptedAt)
      ? 'accepted'
      : status === 'dispatched' || status === 'driver_en_route'
        ? 'en_route'
        : status === 'driver_arrived'
          ? 'arrived'
          : status === 'passenger_onboard'
            ? 'passenger_onboard'
            : status === 'in_progress'
              ? 'started'
              : status === 'completed'
                ? 'completed'
                : status === 'cancelled'
                  ? 'cancelled'
                  : status === 'assigned'
                    ? 'assigned'
                    : null

  const steps: AdminTimelineStep[] = [
    { key: 'assigned', label: 'Driver assigned', timestamp: timestampValue(timestamps.assignedAt), state: 'pending' },
    { key: 'accepted', label: 'Driver accepted', timestamp: timestampValue(timestamps.acceptedAt), state: 'pending' },
    { key: 'en_route', label: 'Heading to pickup', timestamp: timestampValue(timestamps.enRouteAt), state: 'pending' },
    { key: 'arrived', label: 'Driver arrived', timestamp: timestampValue(timestamps.arrivedAt), state: 'pending' },
    {
      key: 'passenger_onboard',
      label: 'Passenger onboard',
      timestamp: timestampValue(timestamps.passengerOnboardAt),
      state: 'pending',
    },
    { key: 'started', label: 'Trip started', timestamp: timestampValue(timestamps.startedAt), state: 'pending' },
    { key: 'completed', label: 'Trip completed', timestamp: timestampValue(timestamps.completedAt), state: 'pending' },
  ]

  const cutoffIndex = currentKey ? steps.findIndex((step) => step.key === currentKey) : -1
  return steps
    .map((step, index): AdminTimelineStep => {
      const state: AdminTimelineStep['state'] =
        terminalCompleted && step.key === 'completed'
          ? 'terminal'
          : currentKey === step.key
            ? 'current'
            : step.timestamp || (cutoffIndex >= 0 && index < cutoffIndex)
              ? 'complete'
              : 'pending'
      return { ...step, state }
    })
    .concat(
      terminalCancelled
        ? [
            {
              key: 'cancelled' as const,
              label: 'Trip cancelled',
              timestamp: timestampValue(timestamps.cancelledAt),
              state: 'terminal' as const,
            },
          ]
        : []
    )
}

export function shouldPollAdminLiveTrip(status: string) {
  return MONITORABLE_STATUSES.has(status) && !TERMINAL_STATUSES.has(status)
}

export function adminLocationFreshness(
  location: AdminLatestLocation,
  now: Date = new Date()
): {
  state: 'unavailable' | 'fresh' | 'stale' | 'expired'
  label: string
  ageSeconds: number | null
} {
  if (!location) {
    return { state: 'unavailable', label: 'Location not available yet', ageSeconds: null }
  }

  const receivedAt = new Date(location.receivedAt)
  const expiresAt = new Date(location.expiresAt)
  if (Number.isNaN(receivedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    return { state: 'unavailable', label: 'Location timestamp unavailable', ageSeconds: null }
  }

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - receivedAt.getTime()) / 1000))
  if (expiresAt.getTime() < now.getTime()) {
    return { state: 'expired', label: `Expired ${formatAge(ageSeconds)} ago`, ageSeconds }
  }
  if (ageSeconds <= 90) {
    return { state: 'fresh', label: `Updated ${formatAge(ageSeconds)} ago`, ageSeconds }
  }
  return { state: 'stale', label: `Stale, updated ${formatAge(ageSeconds)} ago`, ageSeconds }
}

function formatAge(seconds: number) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  return `${hours} hour${hours === 1 ? '' : 's'}`
}
