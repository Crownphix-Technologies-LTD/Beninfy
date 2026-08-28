'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  adminLocationFreshness,
  adminTripCurrentState,
  adminTripTimeline,
  shouldPollAdminLiveTrip,
  type AdminLatestLocation,
} from '@/lib/admin/liveTripMonitoring'
import {
  getGoogleMaps,
  GOOGLE_MAPS_AUTH_FAILURE_EVENT,
  hasGoogleMapsAuthFailed,
  loadGoogleMaps,
  type LatLngLiteral,
} from '@/lib/googleMaps'

type Coordinate = {
  latitude: number
  longitude: number
} | null

export type LiveTripMonitorLeg = {
  id: string
  status: string
  from: string
  to: string
  assignedAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
  enRouteAt: string | null
  arrivedAt: string | null
  passengerOnboardAt: string | null
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancellationReasonCode: string | null
  pickupAddress: string | null
  dropoffAddress: string | null
  pickupCoordinates: Coordinate
  dropoffCoordinates: Coordinate
  latestLocation: AdminLatestLocation
  driver: { id: string; name: string; phone: string } | null
  fleetVehicle: { id: string; label: string; plateNumber: string; color: string | null } | null
}

type LiveTripMonitorProps = {
  leg: LiveTripMonitorLeg
  bookingStatus: string
  paymentStatus: string | null
  reference: string
}

const DEFAULT_CENTER: LatLngLiteral = { lat: 6.5244, lng: 3.3792 }

export default function LiveTripMonitor({
  leg,
  bookingStatus,
  paymentStatus,
  reference,
}: LiveTripMonitorProps) {
  const timeline = adminTripTimeline({ status: leg.status, timestamps: leg })
  const currentState = adminTripCurrentState({ status: leg.status, timestamps: leg })
  const freshness = adminLocationFreshness(leg.latestLocation)
  const active = shouldPollAdminLiveTrip(leg.status)

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-[#eaddec] bg-[#fffafd]">
      <div className="border-b border-[#eaddec] bg-gradient-to-r from-[#3e004c] to-[#6f1d7a] px-4 py-3 text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/65">
              Live operations
            </p>
            <h3 className="mt-1 text-sm font-black uppercase tracking-[0.08em]">
              {currentState}
            </h3>
            <p className="mt-1 text-xs text-white/75">
              {leg.from} → {leg.to} · {reference}
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
            {active ? 'Monitoring' : 'Static'}
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <AdminTripMap leg={leg} />

        <div className="space-y-3">
          <div className="rounded-lg border border-white bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
              Assignment
            </p>
            <dl className="mt-2 space-y-2 text-xs">
              <InfoRow label="Driver" value={leg.driver?.name ?? 'Not assigned'} />
              <InfoRow
                label="Vehicle"
                value={
                  leg.fleetVehicle
                    ? `${leg.fleetVehicle.label} · ${leg.fleetVehicle.plateNumber}`
                    : 'Not assigned'
                }
              />
              <InfoRow label="Pickup" value={leg.pickupAddress ?? 'Not supplied'} />
              <InfoRow label="Destination" value={leg.dropoffAddress ?? 'Not supplied'} />
              <InfoRow label="Trip state" value={currentState} />
              <InfoRow label="Payment" value={paymentStatus ?? 'No payment'} />
              <InfoRow label="Booking" value={bookingStatus} />
            </dl>
          </div>

          <div className="rounded-lg border border-white bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
              Driver location
            </p>
            <p
              className={`mt-2 text-xs font-semibold ${
                freshness.state === 'fresh'
                  ? 'text-emerald-700'
                  : freshness.state === 'stale'
                    ? 'text-amber-700'
                    : freshness.state === 'expired'
                      ? 'text-red-700'
                      : 'text-gray-500'
              }`}
            >
              {freshness.label}
            </p>
          </div>
        </div>
      </div>

      <ol className="grid gap-2 border-t border-[#eaddec] bg-white px-3 py-3 sm:grid-cols-2 xl:grid-cols-4">
        {timeline.map((step) => (
          <li key={step.key} className="flex items-start gap-2 rounded-lg bg-[#fbf7fc] p-2">
            <span
              className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                step.state === 'current'
                  ? 'bg-[#3e004c] ring-4 ring-[#eaddec]'
                  : step.state === 'terminal'
                    ? 'bg-emerald-600'
                    : step.state === 'complete'
                      ? 'bg-[#8a6491]'
                      : 'bg-gray-300'
              }`}
            />
            <span>
              <span className="block text-[11px] font-semibold text-gray-800">{step.label}</span>
              <span className="block text-[10px] text-gray-400">
                {step.timestamp ? formatTimestamp(step.timestamp) : 'Pending'}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-right font-semibold text-gray-800">{value}</dd>
    </div>
  )
}

function AdminTripMap({ leg }: { leg: LiveTripMonitorLeg }) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<InstanceType<NonNullable<ReturnType<typeof getGoogleMaps>>['Map']> | null>(null)
  const markersRef = useRef<Array<{ setMap: (map: unknown | null) => void }>>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const pickup = toLatLng(leg.pickupCoordinates)
  const dropoff = toLatLng(leg.dropoffCoordinates)

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
    if (!apiKey) return
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
          zoom: 10,
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

  const points = useMemo(
    () =>
      [
        pickup ? { ...pickup, title: 'Pickup', label: 'P', color: '#3e004c' } : null,
        dropoff ? { ...dropoff, title: 'Destination', label: 'D', color: '#735c00' } : null,
        leg.latestLocation
          ? {
              lat: leg.latestLocation.latitude,
              lng: leg.latestLocation.longitude,
              title: 'Driver',
              label: 'V',
              color: '#137333',
            }
          : null,
      ].filter(Boolean) as Array<LatLngLiteral & { title: string; label: string; color: string }>,
    [dropoff, leg.latestLocation, pickup]
  )

  useEffect(() => {
    const maps = getGoogleMaps()
    const map = mapInstanceRef.current
    if (!maps || !map || loadStatus !== 'ready') return

    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []

    for (const point of points) {
      markersRef.current.push(
        new maps.Marker({
          map,
          position: { lat: point.lat, lng: point.lng },
          title: point.title,
          label: point.label,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: point.label === 'V' ? 10 : 8,
            fillColor: point.color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        })
      )
    }

    if (points.length > 1) {
      const bounds = new maps.LatLngBounds()
      points.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }))
      map.fitBounds(bounds, 64)
    } else if (points[0]) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng })
      map.setZoom(13)
    }
  }, [loadStatus, points])

  const canShowMap = Boolean(apiKey) && loadStatus !== 'failed'

  return (
    <div className="relative h-[260px] overflow-hidden rounded-lg border border-white bg-[#f4f2f8] shadow-sm">
      {canShowMap && <div ref={mapRef} className="h-full w-full" />}
      {(!apiKey || loadStatus === 'failed' || points.length === 0) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          <span className="material-symbols-outlined text-[28px] text-[#3e004c]">map</span>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {points.length === 0 ? 'Coordinates not available yet' : 'Map preview unavailable'}
          </p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-500">
            Pickup, destination, and driver markers appear when authorized coordinates are present.
          </p>
        </div>
      )}
      {apiKey && loadStatus === 'loading' && points.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
          <div className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow">
            Loading map
          </div>
        </div>
      )}
    </div>
  )
}

function toLatLng(coordinate: Coordinate): LatLngLiteral | null {
  if (!coordinate) return null
  return { lat: coordinate.latitude, lng: coordinate.longitude }
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
