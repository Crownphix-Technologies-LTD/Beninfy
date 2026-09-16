'use client'

import { canStartDriverSearch, driverAssignmentStatus } from '@/lib/driverAssignmentStatus'

type Props = {
  bookingStatus: string
  leg: { status: string; driverId: string | null; driverSearchStatus: string }
  disabled: boolean
  onAction: (action: 'start' | 'stop') => void
}

export default function DriverSearchControls({ bookingStatus, leg, disabled, onAction }: Props) {
  const input = { ...leg, bookingStatus }
  const status = driverAssignmentStatus(input)
  const label = {
    not_searching: 'Not searching',
    searching: 'Searching for Driver',
    assigned: 'Driver assigned',
  }[status]
  const canStart = canStartDriverSearch(input) && leg.driverSearchStatus === 'idle'
  const canStop = leg.driverSearchStatus === 'searching'

  return (
    <div className="my-2 flex items-center justify-between gap-2 text-xs">
      <span role="status" aria-live="polite">
        {label}
      </span>
      {(canStart || canStop) && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction(canStop ? 'stop' : 'start')}
          className="min-w-36 rounded-lg border border-gray-200 px-3 py-2 font-medium disabled:opacity-50"
        >
          {canStop ? 'Stop Driver Search' : 'Start Driver Search'}
        </button>
      )}
    </div>
  )
}
