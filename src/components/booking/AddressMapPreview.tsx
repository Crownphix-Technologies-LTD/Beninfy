'use client'

import { useEffect, useRef, useState } from 'react'
import {
  getGoogleMaps,
  GOOGLE_MAPS_AUTH_FAILURE_EVENT,
  hasGoogleMapsAuthFailed,
  loadGoogleMaps,
  type LatLngLiteral,
} from '@/lib/googleMaps'

type AddressMapPreviewProps = {
  pickup?: LatLngLiteral | null
  dropoff?: LatLngLiteral | null
  from: string
  to: string
}

const DEFAULT_CENTER: LatLngLiteral = { lat: 6.5244, lng: 3.3792 }

export default function AddressMapPreview({ pickup, dropoff, from, to }: AddressMapPreviewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<InstanceType<NonNullable<ReturnType<typeof getGoogleMaps>>['Map']> | null>(null)
  const markersRef = useRef<Array<{ setMap: (map: unknown | null) => void }>>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    const handleAuthFailure = () => {
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
      mapInstanceRef.current = null
      setLoadStatus('failed')
    }
    window.addEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handleAuthFailure)
    return () => window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handleAuthFailure)
  }, [])

  useEffect(() => {
    if (!apiKey) {
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
      })
      .catch(() => {
        if (active) setLoadStatus('failed')
      })

    return () => {
      active = false
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
    }
  }, [apiKey])

  const status = !apiKey ? 'manual' : loadStatus

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

  const isMapVisible = apiKey && status !== 'failed'

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_12px_35px_rgba(62,0,76,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-[#fbf8fc] px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Location preview</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {pickup && dropoff ? 'Pickup and drop-off pinned' : 'Select addresses to pin them on the map'}
          </p>
        </div>
        <span
          className="material-symbols-outlined text-[20px]"
          style={{ color: status === 'ready' ? '#137333' : '#9ca3af' }}
          title={status === 'ready' ? 'Google map ready' : 'Map loading'}
        >
          {status === 'ready' ? 'map' : 'travel_explore'}
        </span>
      </div>

      <div className="relative h-[220px] bg-[#f4f2f8] md:h-[260px]">
        {isMapVisible && <div ref={mapRef} className="h-full w-full" />}

        {(!apiKey || status === 'failed') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3e8f8]">
              <span className="material-symbols-outlined text-[24px] text-primary">map</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">Google Maps preview is not active yet</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500">
              Check the Maps JavaScript API, Places API, billing, and website referrer restrictions for the configured Google key.
            </p>
          </div>
        )}

        {apiKey && status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm">
              <span className="material-symbols-outlined animate-spin text-[17px] text-primary">progress_activity</span>
              Loading map
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
