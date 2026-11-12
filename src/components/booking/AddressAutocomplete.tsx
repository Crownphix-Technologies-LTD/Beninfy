'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { GooglePlaceResult } from '@/lib/googleMaps'

type PlaceSuggestion = { placeId: string; displayName: string; formattedAddress: string | null }
type PlaceDetail = PlaceSuggestion & {
  latitude: number | null
  longitude: number | null
  city: string | null
  country: string | null
  countryCode: string | null
}

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

const REQUEST_TIMEOUT_MS = 8000
const language = () => (document.documentElement.lang.toLowerCase().startsWith('fr') ? 'fr' : 'en')

async function getJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(typeof body?.error?.code === 'string' ? body.error.code : 'PLACE_SEARCH_FAILED')
  return body
}

function toGooglePlace(detail: PlaceDetail): GooglePlaceResult {
  return {
    formatted_address: detail.formattedAddress ?? detail.displayName,
    name: detail.displayName,
    place_id: detail.placeId,
    address_components: [
      ...(detail.city
        ? [{ long_name: detail.city, short_name: detail.city, types: ['locality'] }]
        : []),
      ...(detail.country
        ? [
            {
              long_name: detail.country,
              short_name: detail.countryCode ?? detail.country,
              types: ['country'],
            },
          ]
        : []),
    ],
    geometry:
      detail.latitude !== null && detail.longitude !== null
        ? {
            location: {
              lat: () => detail.latitude as number,
              lng: () => detail.longitude as number,
            },
          }
        : undefined,
  }
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
  const rootRef = useRef<HTMLDivElement | null>(null)
  const helperId = useId()
  const listId = useId()
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'failed'>('idle')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [selecting, setSelecting] = useState(false)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    const query = value.trim()
    if (disabled || selecting || query.length < 2) return

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const debounce = window.setTimeout(async () => {
      setStatus('loading')
      try {
        const body = await getJson(
          `/api/mobile/v1/guest/places/autocomplete?q=${encodeURIComponent(query)}&locale=${language()}&limit=6`,
          controller.signal
        )
        const places = Array.isArray(body?.places) ? (body.places as PlaceSuggestion[]) : []
        setSuggestions(places)
        setStatus(places.length ? 'ready' : 'empty')
        setOpen(true)
        setActiveIndex(-1)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSuggestions([])
          setStatus('failed')
          setOpen(true)
        }
      } finally {
        window.clearTimeout(timeout)
      }
    }, 300)

    return () => {
      window.clearTimeout(debounce)
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [disabled, selecting, value])

  async function selectPlace(suggestion: PlaceSuggestion) {
    if (selecting) return
    setSelecting(true)
    setStatus('loading')
    try {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      const body = await getJson(
        `/api/mobile/v1/guest/places/${encodeURIComponent(suggestion.placeId)}?locale=${language()}`,
        controller.signal
      ).finally(() => window.clearTimeout(timeout))
      const detail = body?.place as PlaceDetail | undefined
      if (!detail || detail.latitude === null || detail.longitude === null)
        throw new Error('PLACE_NOT_FOUND')
      const address = detail.formattedAddress ?? detail.displayName
      onChange(address)
      onPlaceSelected?.(address, toGooglePlace(detail))
      setSuggestions([])
      setOpen(false)
      setStatus('idle')
    } catch {
      setStatus('failed')
      setOpen(true)
    } finally {
      setSelecting(false)
    }
  }

  const french = typeof document !== 'undefined' && language() === 'fr'
  const statusText =
    status === 'loading'
      ? french
        ? 'Recherche en cours...'
        : 'Searching addresses...'
      : status === 'empty'
        ? french
          ? 'Aucune adresse trouvee. Precisez votre recherche.'
          : 'No addresses found. Refine your search.'
        : status === 'failed'
          ? french
            ? 'Recherche indisponible. Reessayez.'
            : 'Address search is unavailable. Try again.'
          : null

  return (
    <div ref={rootRef} className="relative space-y-2">
      <div className="relative">
        <span
          className="material-symbols-outlined pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          style={{ fontSize: 18, color: iconColor }}
        >
          {icon}
        </span>
        <input
          type="text"
          value={value}
          onChange={(event) => {
            setSelecting(false)
            if (event.target.value.trim().length < 2) {
              setSuggestions([])
              setStatus('idle')
              setOpen(false)
            }
            onChange(event.target.value)
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={(event) => {
            if (!open || !suggestions.length) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((index) => Math.max(index - 1, 0))
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault()
              void selectPlace(suggestions[activeIndex])
            } else if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder={placeholder}
          className={`${inputClassName} pr-12 pl-10`}
          aria-describedby={helperText ? helperId : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          role="combobox"
          autoComplete="off"
          disabled={disabled}
        />
        <span
          className={`material-symbols-outlined absolute top-1/2 right-3 -translate-y-1/2 ${status === 'loading' ? 'animate-spin' : ''}`}
          aria-hidden="true"
          style={{ fontSize: 18, color: status === 'ready' ? '#137333' : '#9ca3af' }}
        >
          {status === 'loading' ? 'progress_activity' : 'travel_explore'}
        </span>
      </div>

      {open && (suggestions.length > 0 || statusText) && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          {suggestions.map((suggestion, index) => (
            <button
              id={`${listId}-${index}`}
              key={suggestion.placeId}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              className={`flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${activeIndex === index ? 'bg-gray-50' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void selectPlace(suggestion)}
            >
              <span
                className="material-symbols-outlined text-primary mt-0.5 text-[18px]"
                aria-hidden="true"
              >
                location_on
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">
                  {suggestion.displayName}
                </span>
                {suggestion.formattedAddress && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                    {suggestion.formattedAddress}
                  </span>
                )}
              </span>
            </button>
          ))}
          {statusText && !suggestions.length && (
            <p role="status" className="px-4 py-3 text-sm text-gray-600">
              {statusText}
            </p>
          )}
        </div>
      )}

      {helperText && (
        <p id={helperId} className="text-xs leading-relaxed text-gray-500">
          {helperText}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {statusText}
      </p>
    </div>
  )
}
