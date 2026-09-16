export type DriverAssignmentStatus = 'not_searching' | 'searching' | 'assigned'

// These are the existing pre-execution states in which Operations can seek a driver.
// `assigned` can mean fleet-only assignment in the existing Ride lifecycle.
export const DRIVER_SEARCH_ELIGIBLE_LEG_STATUSES = ['reserved', 'unassigned', 'assigned']

type AssignmentInput = {
  bookingStatus: string
  status: string
  driverId: string | null
  driverSearchStatus: string
}

export function canStartDriverSearch(input: AssignmentInput) {
  return (
    input.bookingStatus === 'confirmed' &&
    DRIVER_SEARCH_ELIGIBLE_LEG_STATUSES.includes(input.status) &&
    input.driverId === null
  )
}

export function driverAssignmentStatus(input: AssignmentInput): DriverAssignmentStatus {
  if (input.bookingStatus !== 'confirmed') return 'not_searching'
  if (
    ![
      ...DRIVER_SEARCH_ELIGIBLE_LEG_STATUSES,
      'dispatched',
      'driver_en_route',
      'driver_arrived',
      'passenger_onboard',
      'in_progress',
    ].includes(input.status)
  )
    return 'not_searching'
  if (input.driverId) return 'assigned'
  return canStartDriverSearch(input) && input.driverSearchStatus === 'searching'
    ? 'searching'
    : 'not_searching'
}

// Assignment/removal is an explicit Operations decision. Neither removal nor a
// non-dispatchable lifecycle transition may carry an old search into the future.
export function driverSearchStatusAfterLegUpdate(input: {
  driverId?: string | null
  status?: string
}) {
  return input.driverId !== undefined ||
    (input.status !== undefined && !DRIVER_SEARCH_ELIGIBLE_LEG_STATUSES.includes(input.status))
    ? ('idle' as const)
    : undefined
}
