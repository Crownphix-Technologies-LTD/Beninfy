'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatNGN } from '@/lib/utils'
import { AdminModal, AdminPageHeader, AdminStatusBadge, adminSecondaryButtonClass } from '@/components/admin/AdminUI'

type TourBookingDay = {
  id: string
  dayNumber: number
  totalDays: number
  label: string
  scheduledDate: string
  status: string
  title: string
  pickup: { label: string | null; address: string | null; coordinates: { latitude: number; longitude: number } | null }
  end: { label: string | null; address: string | null; coordinates: { latitude: number; longitude: number } | null }
  assignment: { driverId: string | null; fleetVehicleId: string | null; assignedAt: string | null; acceptedAt: string | null }
  tracking?: {
    latestLocation: {
      latitude: number
      longitude: number
      receivedAt: string | null
      expiresAt: string | null
    } | null
    journey: {
      target: string | null
      targetStopId: string | null
      distanceRemainingMeters: number | null
      estimatedDurationSeconds: number | null
      estimatedArrivalAt: string | null
      calculatedAt: string | null
      routePolyline?: string | null
    } | null
  }
  stops: Array<{
    id: string
    stopNumber: number
    totalStops: number
    title: string
    address: string
    status: string
    coordinates: { latitude: number; longitude: number }
  }>
}

type TourBookingRow = {
  id: string
  reference: string
  status: string
  startDate: string
  endDate: string
  travellers: number
  price: { value: number; currency: string }
  payment: { status: string; provider: string | null; paymentReference: string | null; canInitialize: boolean }
  tour: { title: string; destination: string | null; country: string; image: string | null }
  progress: { currentDay: number | null; totalDays: number }
  customer: { id: string; name: string | null; email: string | null; phone: string | null }
  days: TourBookingDay[]
  timestamps: { createdAt: string; updatedAt: string; cancelledAt: string | null; completedAt: string | null }
}

type DriverOption = {
  id: string
  name: string
  status: string
}

type FleetVehicleOption = {
  id: string
  label: string
  plateNumber: string
  status: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function freshness(
  latestLocation: {
    latitude: number
    longitude: number
    receivedAt: string | null
    expiresAt: string | null
  } | null
) {
  if (!latestLocation?.receivedAt) return 'unavailable'
  if (latestLocation.expiresAt && new Date(latestLocation.expiresAt).getTime() < Date.now()) return 'unavailable'
  const ageSeconds = Math.floor((Date.now() - new Date(latestLocation.receivedAt).getTime()) / 1000)
  if (ageSeconds <= 90) return 'live'
  return 'stale'
}

function eta(seconds: number | null | undefined) {
  if (typeof seconds !== 'number') return '—'
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} min`
}

export default function AdminTourBookingsPage() {
  const [tourBookings, setTourBookings] = useState<TourBookingRow[]>([])
  const [selected, setSelected] = useState<TourBookingRow | null>(null)
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assigningDayId, setAssigningDayId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [bookingsRes, driversRes, fleetRes] = await Promise.all([
        fetch('/api/admin/tour-bookings'),
        fetch('/api/admin/drivers'),
        fetch('/api/admin/fleet-vehicles'),
      ])
      const [bookingsData, driversData, fleetData] = await Promise.all([
        bookingsRes.json().catch(() => ({})),
        driversRes.json().catch(() => ({})),
        fleetRes.json().catch(() => ({})),
      ])
      if (!bookingsRes.ok) {
        throw new Error(typeof bookingsData.error === 'string' ? bookingsData.error : 'Failed to load tour bookings')
      }
      setTourBookings(bookingsData.tourBookings ?? [])
      setDrivers(driversRes.ok ? (driversData.drivers ?? []) : [])
      setFleetVehicles(fleetRes.ok ? (fleetData.fleetVehicles ?? []) : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tour bookings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
    }
    void initialLoad()
  }, [load])

  const stats = useMemo(() => {
    const pending = tourBookings.filter((booking) => booking.payment.status === 'pending').length
    const paid = tourBookings.filter((booking) => booking.payment.status === 'paid').length
    return { pending, paid }
  }, [tourBookings])

  const assignDay = async (dayId: string, driverId: string, fleetVehicleId: string) => {
    setAssigningDayId(dayId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/tour-bookings/days/${dayId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: driverId || null,
          fleetVehicleId: fleetVehicleId || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Assignment failed')
      await load()
      setSelected((current) => {
        if (!current) return current
        return {
          ...current,
          days: current.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  status: data.tour?.day?.status ?? day.status,
                  assignment: {
                    ...day.assignment,
                    driverId: data.tour?.driver?.id ?? null,
                    fleetVehicleId: data.tour?.vehicle?.id ?? null,
                    assignedAt: data.tour?.day?.timestamps?.assignedAt ?? day.assignment.assignedAt,
                    acceptedAt: data.tour?.day?.timestamps?.acceptedAt ?? null,
                  },
                }
              : day
          ),
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed')
    } finally {
      setAssigningDayId(null)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Tour bookings"
        description="Read-only tour booking visibility for itinerary snapshots, customer details, dates, travellers, and payment state."
        icon="tour"
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(62,0,76,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Total</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{tourBookings.length}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(62,0,76,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Pending payment</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{stats.pending}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(62,0,76,0.07)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Paid</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{stats.paid}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{tourBookings.length} tour bookings</p>
            <p className="text-xs text-gray-400">Operational rows are snapshots and will not change when catalogue templates are edited.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-gray-300">travel_explore</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fbf7fc] text-xs uppercase tracking-[0.14em] text-gray-500">
              <tr>
                <th className="px-5 py-3.5 text-left font-semibold">Reference</th>
                <th className="px-5 py-3.5 text-left font-semibold">Customer</th>
                <th className="px-5 py-3.5 text-left font-semibold">Tour</th>
                <th className="px-5 py-3.5 text-left font-semibold">Dates</th>
                <th className="px-5 py-3.5 text-left font-semibold">Travellers</th>
                <th className="px-5 py-3.5 text-left font-semibold">Price</th>
                <th className="px-5 py-3.5 text-left font-semibold">Status</th>
                <th className="px-5 py-3.5 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-14 text-center text-gray-400">Loading...</td></tr>
              ) : tourBookings.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-14 text-center text-gray-400">No tour bookings yet.</td></tr>
              ) : tourBookings.map((booking) => (
                <tr key={booking.id} className="border-t border-gray-100 align-top transition-colors hover:bg-[#fcf9fd]">
                  <td className="px-5 py-4"><code className="rounded-lg bg-[#fbf7fc] px-2 py-1 text-xs text-gray-700">{booking.reference}</code></td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">{booking.customer.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{booking.customer.email ?? '—'}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">{booking.tour.title}</p>
                    <p className="text-xs text-gray-400">{booking.tour.destination ?? booking.tour.country}</p>
                  </td>
                  <td className="px-5 py-4 text-gray-700">{formatDate(booking.startDate)} - {formatDate(booking.endDate)}</td>
                  <td className="px-5 py-4 text-gray-700">{booking.travellers}</td>
                  <td className="px-5 py-4 font-semibold text-gray-900">{formatNGN(booking.price.value)}</td>
                  <td className="px-5 py-4">
                    <div className="space-y-2">
                      <AdminStatusBadge status={booking.status} />
                      <AdminStatusBadge status={booking.payment.status} />
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <button type="button" className={`${adminSecondaryButtonClass} !px-3 !py-2 !text-xs`} onClick={() => setSelected(booking)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AdminModal
        open={Boolean(selected)}
        title={selected?.reference ?? 'Tour booking'}
        eyebrow="Tour booking"
        icon="tour"
        maxWidth="xl"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-100 bg-[#fbf7fc] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Customer</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{selected.customer.name ?? selected.customer.email ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-[#fbf7fc] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Travellers</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{selected.travellers}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-[#fbf7fc] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Price</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{formatNGN(selected.price.value)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-[#fbf7fc] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Payment</p>
                <p className="mt-1 text-sm font-semibold capitalize text-gray-900">{selected.payment.status.replace(/_/g, ' ')}</p>
              </div>
            </div>

            <div className="space-y-4">
              {selected.days.map((day) => (
                <section key={day.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{day.label}</p>
                      <h3 className="mt-1 text-base font-bold text-[#3e004c]">{day.title}</h3>
                      <p className="mt-1 text-xs text-gray-500">{formatDate(day.scheduledDate)}</p>
                    </div>
                    <AdminStatusBadge status={day.status} />
                  </div>
                  <div className="grid gap-3 text-xs text-gray-600 md:grid-cols-2">
                    <p><span className="font-semibold text-gray-800">Pickup:</span> {day.pickup.address ?? day.pickup.label ?? 'Not configured'}</p>
                    <p><span className="font-semibold text-gray-800">End:</span> {day.end.address ?? day.end.label ?? 'Not configured'}</p>
                  </div>
                  <div className="mt-4 rounded-xl border border-[#ecdff0] bg-white p-3 text-xs text-gray-600">
                    <p className="mb-3 font-semibold uppercase tracking-[0.12em] text-gray-400">Live monitor</p>
                    <div className="grid gap-3 md:grid-cols-5">
                    <div>
                      <p className="font-semibold uppercase tracking-[0.12em] text-gray-400">Live state</p>
                      <p className="mt-1 font-semibold capitalize text-gray-900">{day.status.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-[0.12em] text-gray-400">Stop progress</p>
                      <p className="mt-1 font-semibold text-gray-900">
                        {day.stops.filter((stop) => stop.status === 'completed').length} / {day.stops.length}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-[0.12em] text-gray-400">Location freshness</p>
                      <p className="mt-1 font-semibold capitalize text-gray-900">{freshness(day.tracking?.latestLocation ?? null)}</p>
                      {day.tracking?.latestLocation && (
                        <p className="mt-1 text-[11px] text-gray-400">
                          {day.tracking.latestLocation.latitude.toFixed(5)}, {day.tracking.latestLocation.longitude.toFixed(5)}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-[0.12em] text-gray-400">Journey ETA</p>
                      <p className="mt-1 font-semibold text-gray-900">{eta(day.tracking?.journey?.estimatedDurationSeconds)}</p>
                    </div>
                    <div>
                      <p className="font-semibold uppercase tracking-[0.12em] text-gray-400">Journey target</p>
                      <p className="mt-1 font-semibold capitalize text-gray-900">
                        {day.tracking?.journey?.target?.replace(/_/g, ' ') ?? '—'}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {day.tracking?.journey?.targetStopId ? `Stop ${day.tracking.journey.targetStopId}` : 'No active route'}
                      </p>
                    </div>
                    </div>
                  </div>
                  <form
                    className="mt-4 grid gap-3 rounded-xl border border-gray-100 bg-[#fbf7fc] p-3 md:grid-cols-[1fr_1fr_auto]"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const form = new FormData(event.currentTarget)
                      void assignDay(
                        day.id,
                        String(form.get('driverId') ?? ''),
                        String(form.get('fleetVehicleId') ?? '')
                      )
                    }}
                  >
                    <label className="text-xs font-semibold text-gray-600">
                      Driver
                      <select name="driverId" defaultValue={day.assignment.driverId ?? ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#3e004c] focus:ring-2 focus:ring-[#3e004c]/15">
                        <option value="">Unassigned</option>
                        {drivers.map((driver) => (
                          <option key={driver.id} value={driver.id}>{driver.name} - {driver.status}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-gray-600">
                      Fleet vehicle
                      <select name="fleetVehicleId" defaultValue={day.assignment.fleetVehicleId ?? ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#3e004c] focus:ring-2 focus:ring-[#3e004c]/15">
                        <option value="">Unassigned</option>
                        {fleetVehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>{vehicle.label} - {vehicle.plateNumber}</option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" disabled={assigningDayId === day.id} className="self-end rounded-lg bg-[#3e004c] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                      {assigningDayId === day.id ? 'Saving...' : 'Assign'}
                    </button>
                  </form>
                  <div className="mt-4 space-y-2">
                    {day.stops.map((stop) => (
                      <div key={stop.id} className="flex items-start justify-between gap-3 rounded-xl bg-[#fbf7fc] px-3 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Stop {stop.stopNumber} of {stop.totalStops}: {stop.title}</p>
                          <p className="mt-1 text-xs text-gray-500">{stop.address}</p>
                        </div>
                        <AdminStatusBadge status={stop.status} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </AdminModal>
    </div>
  )
}
