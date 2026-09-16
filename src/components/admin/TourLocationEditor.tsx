'use client'

import { useState } from 'react'
import AddressAutocomplete from '@/components/booking/AddressAutocomplete'
import AddressMapPreview from '@/components/booking/AddressMapPreview'
import { getPlaceCoordinates } from '@/lib/googleMaps'
import {
  emptyLocation,
  locationHasCoordinates,
  type LocationDraft,
} from '@/lib/admin/tourItineraryForm'
import {
  adminInputClass,
  adminLabelClass,
  adminSecondaryButtonClass,
} from '@/components/admin/AdminUI'

type Props = {
  title: string
  value: LocationDraft
  onChange: (value: LocationDraft) => void
  showLabel?: boolean
}

export default function TourLocationEditor({ title, value, onChange, showLabel = false }: Props) {
  const [manual, setManual] = useState(false)
  const [preview, setPreview] = useState(false)
  const valid = locationHasCoordinates(value)
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        <button
          type="button"
          className="text-xs text-gray-500 underline"
          onClick={() => {
            if (confirm('Clear this location and its coordinates?')) onChange(emptyLocation())
          }}
        >
          Clear location
        </button>
      </div>
      {showLabel && (
        <label className={adminLabelClass}>
          Location label
          <input
            className={adminInputClass}
            maxLength={160}
            value={value.label}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            placeholder="For example, hotel reception"
          />
        </label>
      )}
      <label className="block">
        <span className={adminLabelClass}>Search location / address</span>
        <AddressAutocomplete
          value={value.address}
          onChange={(address) => onChange({ ...value, address, latitude: '', longitude: '' })}
          onPlaceSelected={(address, place) => {
            const point = getPlaceCoordinates(place)
            onChange({
              ...value,
              address,
              label: value.label || place.name || '',
              latitude: point ? String(point.lat) : '',
              longitude: point ? String(point.lng) : '',
            })
            if (point) setPreview(true)
          }}
          placeholder="Search and select the actual location"
          icon="location_on"
          iconColor="#3e004c"
          inputClassName={adminInputClass}
          helperText="Select a Google result to populate coordinates. Changing the address clears the old coordinates. Save Changes persists the location."
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={adminLabelClass}>
          Latitude
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            readOnly={!manual}
            className={adminInputClass}
            value={value.latitude}
            onChange={(e) => onChange({ ...value, latitude: e.target.value })}
          />
        </label>
        <label className={adminLabelClass}>
          Longitude
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            readOnly={!manual}
            className={adminInputClass}
            value={value.longitude}
            onChange={(e) => onChange({ ...value, longitude: e.target.value })}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
        Enter coordinates from a verified source manually
      </label>
      {!valid && (
        <p className="text-xs font-medium text-amber-800">
          No valid saved point selected in this draft.
        </p>
      )}
      {valid && (
        <button
          type="button"
          className={adminSecondaryButtonClass}
          onClick={() => setPreview(!preview)}
        >
          {preview ? 'Hide map' : 'Preview location on map'}
        </button>
      )}
      {valid && preview && (
        <AddressMapPreview
          pickup={{ lat: Number(value.latitude), lng: Number(value.longitude) }}
          from={value.label || title}
          to=""
        />
      )}
    </div>
  )
}
