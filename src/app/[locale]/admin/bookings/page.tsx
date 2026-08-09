'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatNGN } from '@/lib/utils'
import { AdminPageHeader, AdminStatusBadge } from '@/components/admin/AdminUI'

interface BookingRow {
  id: string
  from: string
  to: string
  date: string
  returnDate: string | null
  tripType: string
  passengers: number
  priceNGN: number
  status: string
  createdAt: string
  passengerName: string | null
  passengerEmail: string | null
  passengerPhone: string | null
  travelers?: TravelerRow[] | null
  user: { id: string; name: string | null; email: string | null; phone: string | null } | null
  vehicle: { id: string; name: string } | null
  payments: { id: string; status: string; amountNGN: number; reference: string }[]
  legs: BookingLegRow[]
}

interface TravelerRow {
  fullName?: string
  email?: string
  phone?: string
  passportId?: string
  nationality?: string
  lead?: boolean
  sequence?: number
}

interface BookingLegRow {
  id: string
  direction: string
  from: string
  to: string
  departureDate: string
  vehicleId: string
  status: string
  fleetVehicleId: string | null
  driverId: string | null
  fleetVehicle: { id: string; label: string; plateNumber: string; color: string | null } | null
  driver: { id: string; name: string; phone: string } | null
}

interface FleetVehicleOption {
  id: string
  vehicleId: string
  label: string
  plateNumber: string
  color: string | null
  status: string
}

interface DriverOption {
  id: string
  name: string
  phone: string
  status: string
}

const STATUSES = ['', 'pending', 'confirmed', 'ops_review', 'cancelled', 'completed']

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicleOption[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (q) params.set('q', q)
    const res = await fetch(`/api/admin/bookings?${params.toString()}`)
    const data = await res.json()
    setBookings(data.bookings ?? [])
    setLoading(false)
  }, [status, q])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/fleet-vehicles').then((r) => r.ok ? r.json() : { fleetVehicles: [] }),
      fetch('/api/admin/drivers').then((r) => r.ok ? r.json() : { drivers: [] }),
    ]).then(([fleetData, driverData]) => {
      setFleetVehicles(fleetData.fleetVehicles ?? [])
      setDrivers(driverData.drivers ?? [])
    })
  }, [])

  const updateStatus = async (id: string, newStatus: string) => {
    setBusy(id)
    try {
      await fetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      await load()
    } finally { setBusy(null) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete booking (and its payments)?')) return
    setBusy(id)
    try {
      await fetch(`/api/admin/bookings/${id}`, { method: 'DELETE' })
      setBookings((prev) => prev.filter((b) => b.id !== id))
    } finally { setBusy(null) }
  }

  const assignLeg = async (legId: string, payload: { fleetVehicleId?: string | null; driverId?: string | null }) => {
    setBusy(legId)
    try {
      const res = await fetch(`/api/admin/booking-legs/${legId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) alert(data.error ?? 'Assignment failed')
      await load()
    } finally { setBusy(null) }
  }

  return (
    <div>
      <AdminPageHeader
        title="Bookings"
        description="Assign vehicles and drivers, confirm trip statuses, and monitor customer ride operations."
        icon="event"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-[#eaddec] bg-white px-4 py-2.5 text-sm font-semibold text-[#3e004c] shadow-sm transition-colors hover:bg-[#fbf7fc]"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh
          </button>
        }
      />

      <div className="mb-4 rounded-2xl border border-white/70 bg-white p-4 shadow-[0_14px_35px_rgba(62,0,76,0.07)]">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
            <input
              type="search"
              placeholder="Search route, customer, email, phone..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-[#fbf7fc] py-3 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-[#3e004c] focus:bg-white focus:ring-2 focus:ring-[#3e004c]/15"
            />
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-[#fbf7fc] px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-[#3e004c] focus:bg-white focus:ring-2 focus:ring-[#3e004c]/15"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s || 'All statuses'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{bookings.length} bookings</p>
            <p className="text-xs text-gray-400">Use each leg card to assign a fleet unit and driver.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-gray-300">assignment</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#fbf7fc] text-xs uppercase tracking-[0.14em] text-gray-500">
            <tr>
              <th className="text-left px-5 py-3.5 font-semibold">Customer</th>
              <th className="text-left px-5 py-3.5 font-semibold">Route</th>
              <th className="text-left px-5 py-3.5 font-semibold">Vehicle</th>
              <th className="text-left px-5 py-3.5 font-semibold">Date</th>
              <th className="text-left px-5 py-3.5 font-semibold">Legs</th>
              <th className="text-left px-5 py-3.5 font-semibold">Pax</th>
              <th className="text-left px-5 py-3.5 font-semibold">Price</th>
              <th className="text-left px-5 py-3.5 font-semibold">Payments</th>
              <th className="text-left px-5 py-3.5 font-semibold">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-5 py-14 text-center text-gray-400">Loading...</td></tr>
            ) : bookings.length === 0 ? (
              <tr><td colSpan={10} className="px-5 py-14 text-center text-gray-400">No bookings.</td></tr>
            ) : bookings.map((b) => (
              <tr key={b.id} className="border-t border-gray-100 align-top transition-colors hover:bg-[#fcf9fd]">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-800">{b.passengerName ?? b.user?.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{b.passengerEmail ?? b.user?.email ?? 'guest'}</p>
                  {(b.passengerPhone ?? b.user?.phone) && <p className="text-xs text-gray-400">{b.passengerPhone ?? b.user?.phone}</p>}
                  {Array.isArray(b.travelers) && b.travelers.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-[#3e004c]">
                        Traveller manifest
                      </summary>
                      <div className="mt-2 space-y-2">
                        {b.travelers.map((traveler, index) => (
                          <div key={`${traveler.fullName ?? 'traveler'}-${index}`} className="rounded-lg border border-[#eaddec] bg-[#fbf7fc] p-2 text-xs text-gray-600">
                            <p className="font-semibold text-gray-900">
                              {traveler.lead ? 'Lead: ' : `${traveler.sequence ?? index + 1}. `}
                              {traveler.fullName || 'Unnamed traveller'}
                            </p>
                            {traveler.phone && <p>{traveler.phone}</p>}
                            {traveler.nationality && <p>{traveler.nationality}</p>}
                            {traveler.passportId && <p>ID: {traveler.passportId}</p>}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
                <td className="px-5 py-4 text-gray-700">
                  <p className="font-medium text-gray-900">{b.from} → {b.to}</p>
                  <p className="mt-1 text-xs text-gray-400">{b.tripType === 'round_trip' ? 'round trip' : 'one way'}</p>
                </td>
                <td className="px-5 py-4 text-gray-700">{b.vehicle?.name ?? b.id}</td>
                <td className="px-5 py-4 text-gray-700">{new Date(b.date).toLocaleDateString()}</td>
                <td className="px-5 py-4 min-w-[320px]">
                  <div className="space-y-3">
                    {b.legs.map((leg) => (
                      <div key={leg.id} className="rounded-xl border border-[#eaddec] bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-semibold text-gray-900">{leg.direction}: {leg.from} → {leg.to}</p>
                          <span className="rounded-full bg-[#fbf7fc] px-2 py-1 text-[10px] font-semibold uppercase text-gray-500">{new Date(leg.departureDate).toLocaleDateString()}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <select
                            value={leg.fleetVehicleId ?? ''}
                            disabled={busy === leg.id}
                            onChange={(e) => assignLeg(leg.id, { fleetVehicleId: e.target.value || null })}
                            className="rounded-lg border border-gray-200 bg-[#fbf7fc] px-2 py-2 text-xs outline-none focus:border-[#3e004c] focus:bg-white focus:ring-2 focus:ring-[#3e004c]/15"
                          >
                            <option value="">Assign fleet unit</option>
                            {fleetVehicles
                              .filter((v) => v.vehicleId === leg.vehicleId)
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  {[v.label, v.plateNumber, v.color, v.status].filter(Boolean).join(' · ')}
                                </option>
                              ))}
                          </select>
                          <select
                            value={leg.driverId ?? ''}
                            disabled={busy === leg.id}
                            onChange={(e) => assignLeg(leg.id, { driverId: e.target.value || null })}
                            className="rounded-lg border border-gray-200 bg-[#fbf7fc] px-2 py-2 text-xs outline-none focus:border-[#3e004c] focus:bg-white focus:ring-2 focus:ring-[#3e004c]/15"
                          >
                            <option value="">Assign driver</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>{d.name} · {d.status}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4 text-gray-700">{b.passengers}</td>
                <td className="px-5 py-4 font-semibold text-gray-900">{formatNGN(b.priceNGN)}</td>
                <td className="px-5 py-4 text-xs text-gray-500">
                  {b.payments.length === 0 ? '—' : b.payments.map((p) => (
                    <div key={p.id} className="mb-1 flex flex-col gap-1">
                      <AdminStatusBadge status={p.status} />
                      <span>{formatNGN(p.amountNGN)}</span>
                    </div>
                  ))}
                </td>
                <td className="px-5 py-4">
                  <div className="mb-2">
                    <AdminStatusBadge status={b.status} />
                  </div>
                  <select
                    value={b.status}
                    onChange={(e) => updateStatus(b.id, e.target.value)}
                    disabled={busy === b.id}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs outline-none focus:border-[#3e004c] focus:ring-2 focus:ring-[#3e004c]/15"
                  >
                    <option value="pending">pending</option>
                    <option value="confirmed">confirmed</option>
                    <option value="ops_review">ops_review</option>
                    <option value="cancelled">cancelled</option>
                    <option value="completed">completed</option>
                  </select>
                </td>
                <td className="px-5 py-4 text-right whitespace-nowrap">
                  <button onClick={() => remove(b.id)} disabled={busy === b.id} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50" title="Delete booking">
                    <span className="material-symbols-outlined text-[17px]">delete</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
