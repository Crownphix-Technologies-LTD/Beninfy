'use client'

import { useState } from 'react'
import TourLocationEditor from '@/components/admin/TourLocationEditor'
import { emptyLocation, type LocationDraft } from '@/lib/admin/tourItineraryForm'
import { tourPickupSchema } from '@/lib/mobile/tourPickup'
import { adminPrimaryButtonClass, adminSecondaryButtonClass } from '@/components/admin/AdminUI'

type Props = {
  dayId: string
  pickup: {
    label: string | null
    address: string | null
    coordinates: { latitude: number; longitude: number } | null
  }
  onSaved: () => Promise<void>
}

export default function TourDayPickupEditor({ dayId, pickup, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<LocationDraft>(emptyLocation)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    const parsed = tourPickupSchema.safeParse({
      label: draft.label,
      address: draft.address,
      coordinates: {
        latitude: draft.latitude.trim() ? Number(draft.latitude) : null,
        longitude: draft.longitude.trim() ? Number(draft.longitude) : null,
      },
    })
    if (!parsed.success) {
      setError('Select a pickup with a label, address and valid coordinates.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/tour-bookings/days/' + encodeURIComponent(dayId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickup: parsed.data }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error?.message || result.error || 'Pickup save failed')
      await onSaved()
      setOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Pickup save failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button
        type="button"
        className={adminSecondaryButtonClass + ' mt-3'}
        onClick={() => {
          setDraft({
            label: pickup.label ?? '',
            address: pickup.address ?? '',
            latitude: pickup.coordinates?.latitude.toString() ?? '',
            longitude: pickup.coordinates?.longitude.toString() ?? '',
          })
          setError('')
          setOpen(true)
        }}
      >
        Change this day&apos;s pickup
      </button>
    )

  return (
    <fieldset disabled={busy} className="mt-3 space-y-3">
      <p className="text-sm text-gray-600">
        Choose the agreed pickup for this booked day. Other days keep their saved pickups.
      </p>
      <TourLocationEditor title="Day pickup" value={draft} onChange={setDraft} showLabel />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button type="button" className={adminPrimaryButtonClass} onClick={() => void save()}>
          {busy ? 'Saving...' : 'Save Day Pickup'}
        </button>
        <button type="button" className={adminSecondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </fieldset>
  )
}
