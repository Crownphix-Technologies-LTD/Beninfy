'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { getGoogleMaps, loadGoogleMaps, type GooglePlaceResult } from '@/lib/googleMaps'

type AddressAutocompleteProps = {
  value: string
  onChange: (value: string) => void
  onPlaceSelected?: (address: string, place: GooglePlaceResult) => void
  placeholder: string
  icon: string
  iconColor: string
  inputClassName: string
  disabled?: boolean
  helperText?: string
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  icon,
  iconColor,
  inputClassName,
  disabled,
  helperText,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onChangeRef = useRef(onChange)
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  const helperId = useId()
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    onChangeRef.current = onChange
    onPlaceSelectedRef.current = onPlaceSelected
  }, [onChange, onPlaceSelected])

  useEffect(() => {
    if (!apiKey || disabled) {
      return
    }

    let active = true
    let listener: { remove?: () => void } | undefined

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!active || !inputRef.current) return
        const Autocomplete = getGoogleMaps()?.places?.Autocomplete
        if (!Autocomplete) {
          setLoadStatus('failed')
          return
        }

        const autocomplete = new Autocomplete(inputRef.current, {
          componentRestrictions: { country: ['ng', 'bj', 'tg', 'gh'] },
          fields: ['formatted_address', 'geometry.location', 'name', 'place_id'],
        })

        listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          const address = place.formatted_address || place.name || inputRef.current?.value || ''
          onChangeRef.current(address)
          onPlaceSelectedRef.current?.(address, place)
        })
        setLoadStatus('ready')
      })
      .catch(() => {
        if (active) setLoadStatus('failed')
      })

    return () => {
      active = false
      listener?.remove?.()
    }
  }, [apiKey, disabled])

  const status = !apiKey || disabled ? 'manual' : loadStatus

  const statusLabel =
    status === 'ready'
      ? 'Google address search'
      : status === 'loading'
        ? 'Loading address search'
        : 'Manual address entry'

  return (
    <div className="space-y-2">
      <div className="relative">
        <span
          className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ fontSize: 18, color: iconColor }}
        >
          {icon}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${inputClassName} pl-10 pr-12`}
          aria-describedby={helperText ? helperId : undefined}
          autoComplete="off"
          disabled={disabled}
        />
        <span
          className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2"
          title={statusLabel}
          aria-label={statusLabel}
          style={{ fontSize: 18, color: status === 'ready' ? '#137333' : '#9ca3af' }}
        >
          {status === 'ready' ? 'travel_explore' : status === 'loading' ? 'progress_activity' : 'edit_location'}
        </span>
      </div>
      {helperText && (
        <p id={helperId} className="text-xs leading-relaxed text-gray-500">
          {helperText}
        </p>
      )}
    </div>
  )
}
