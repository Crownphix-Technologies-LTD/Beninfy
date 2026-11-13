'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import {
  getGoogleMaps,
  GOOGLE_MAPS_AUTH_FAILURE_EVENT,
  GOOGLE_MAPS_DIAGNOSTIC_EVENT,
  GoogleMapsLoadError,
  hasGoogleMapsAuthFailed,
  loadGoogleMaps,
  type LatLngLiteral,
} from '@/lib/googleMaps'

type AddressMapPreviewProps = {
  pickup?: LatLngLiteral | null
  dropoff?: LatLngLiteral | null
  pickupAddress?: string | null
  dropoffAddress?: string | null
  from: string
  to: string
}

const DEFAULT_CENTER: LatLngLiteral = { lat: 6.5244, lng: 3.3792 }

type DiagnosticStage = 'configuration' | 'authorization' | 'sdk_load' | 'timeout' | 'initialization'

function reportMapsDiagnostic(stage: DiagnosticStage) {
  const detail = { component: 'address_preview', stage }
  window.dispatchEvent(new CustomEvent(GOOGLE_MAPS_DIAGNOSTIC_EVENT, { detail }))
  console.warn('[beninfy-maps]', detail)
}

export default function AddressMapPreview({
  pickup,
  dropoff,
  pickupAddress,
  dropoffAddress,
  from,
  to,
}: AddressMapPreviewProps) {
  const locale = useLocale()
  const french = locale.toLowerCase().startsWith('fr')
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<InstanceType<
    NonNullable<ReturnType<typeof getGoogleMaps>>['Map']
  > | null>(null)
  const markersRef = useRef<Array<{ setMap: (map: unknown | null) => void }>>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'failed'>(
    apiKey ? 'loading' : 'failed'
  )

  useEffect(() => {
    const handleAuthFailure = () => {
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
      mapInstanceRef.current = null
      setLoadStatus('failed')
      reportMapsDiagnostic('authorization')
    }
    window.addEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handleAuthFailure)
    return () => window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handleAuthFailure)
  }, [])

  useEffect(() => {
    if (!apiKey) {
      reportMapsDiagnostic('configuration')
      return
    }

    let active = true

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!active || !mapRef.current) return
        if (hasGoogleMapsAuthFailed()) {
          setLoadStatus('failed')
          return
        }
        const maps = getGoogleMaps()
        if (!maps) {
          setLoadStatus('failed')
          return
        }

        try {
          mapInstanceRef.current = new maps.Map(mapRef.current, {
            center: DEFAULT_CENTER,
            zoom: 7,
            clickableIcons: false,
            disableDefaultUI: true,
            gestureHandling: 'cooperative',
            styles: [
              { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
              { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -25 }] },
              { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dfe8f4' }] },
              { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f7f3f8' }] },
            ],
          })
          setLoadStatus('ready')
        } catch {
          reportMapsDiagnostic('initialization')
          setLoadStatus('failed')
        }
      })
      .catch((error) => {
        if (!active) return
        const stage = error instanceof GoogleMapsLoadError ? error.code : 'initialization'
        reportMapsDiagnostic(stage)
        setLoadStatus('failed')
      })

    return () => {
      active = false
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
    }
  }, [apiKey])

  const status = loadStatus

  useEffect(() => {
    const maps = getGoogleMaps()
    const map = mapInstanceRef.current
    if (!maps || !map || status !== 'ready') return

    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []

    const markerIcon = (color: string) => ({
      path: maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    })

    if (pickup) {
      markersRef.current.push(
        new maps.Marker({
          map,
          position: pickup,
          title: `Pickup in ${from}`,
          label: 'P',
          icon: markerIcon('#3e004c'),
        })
      )
    }

    if (dropoff) {
      markersRef.current.push(
        new maps.Marker({
          map,
          position: dropoff,
          title: `Drop-off in ${to}`,
          label: 'D',
          icon: markerIcon('#735c00'),
        })
      )
    }

    if (pickup && dropoff) {
      const bounds = new maps.LatLngBounds()
      bounds.extend(pickup)
      bounds.extend(dropoff)
      map.fitBounds(bounds, 72)
      return
    }

    const singleLocation = pickup || dropoff
    if (singleLocation) {
      map.setCenter(singleLocation)
      map.setZoom(13)
    }
  }, [dropoff, from, pickup, status, to])

  const isMapVisible = Boolean(apiKey) && status !== 'failed'
  const verifiedLocations = [
    pickup && pickupAddress?.trim()
      ? { label: french ? 'Prise en charge' : 'Pickup', address: pickupAddress.trim() }
      : null,
    dropoff && dropoffAddress?.trim()
      ? { label: french ? 'Destination' : 'Drop-off', address: dropoffAddress.trim() }
      : null,
  ].filter((location): location is { label: string; address: string } => Boolean(location))

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_12px_35px_rgba(62,0,76,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-[#fbf8fc] px-4 py-3">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-gray-500 uppercase">
            {french ? 'Aperçu du trajet' : 'Location preview'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {pickup && dropoff
              ? french ? 'Prise en charge et destination confirmées' : 'Pickup and drop-off confirmed'
              : french ? 'Sélectionnez une adresse dans les suggestions' : 'Select an address from the suggestions'}
          </p>
        </div>
        <span
          className="material-symbols-outlined text-[20px]"
          style={{ color: status === 'ready' ? '#137333' : '#9ca3af' }}
          title={status === 'ready' ? (french ? 'Carte prête' : 'Map ready') : undefined}
        >
          {status === 'ready' ? 'map' : 'travel_explore'}
        </span>
      </div>

      <div className="relative h-[220px] bg-[#f4f2f8] md:h-[260px]">
        {isMapVisible && <div ref={mapRef} className="h-full w-full" />}

        {status === 'failed' && (
          <div className="absolute inset-0 flex flex-col justify-center px-5 py-5 md:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3e8f8]">
                <span className="material-symbols-outlined text-primary text-[23px]">location_on</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {french ? 'Confirmez votre lieu' : 'Confirm your location'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                  {verifiedLocations.length
                    ? french ? 'Votre sélection vérifiée est enregistrée.' : 'Your verified selection is saved.'
                    : french ? 'Choisissez une adresse dans les suggestions.' : 'Choose an address from the suggestions.'}
                </p>
              </div>
            </div>
            {verifiedLocations.length > 0 && (
              <ul className="mt-4 space-y-2" aria-label={french ? 'Lieux vérifiés' : 'Verified locations'}>
                {verifiedLocations.map((location) => (
                  <li key={location.label} className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2.5">
                    <span className="material-symbols-outlined mt-0.5 text-[17px] text-emerald-700" aria-hidden="true">verified</span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-800">{location.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-gray-700">{location.address}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {status === 'loading' && (
          <div className="absolute inset-0 animate-pulse bg-[#f4f2f8]" role="status" aria-label={french ? 'Chargement de la carte' : 'Loading map'}>
            <div className="absolute left-[18%] top-[22%] h-2 w-[48%] rounded-full bg-white/80" />
            <div className="absolute right-[12%] top-[44%] h-2 w-[38%] rounded-full bg-white/70" />
            <div className="absolute bottom-[20%] left-[28%] h-2 w-[56%] rounded-full bg-white/80" />
            <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-primary/20" />
            <span className="sr-only">{french ? 'Chargement de la carte' : 'Loading map'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
