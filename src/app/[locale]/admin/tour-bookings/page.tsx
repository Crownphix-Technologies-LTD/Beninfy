'use client'

import { useEffect, useMemo, useState } from 'react'
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function AdminTourBookingsPage() {
  const [tourBookings, setTourBookings] = useState<TourBookingRow[]>([])
  const [selected, setSelected] = useState<TourBookingRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/admin/tour-bookings')
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load tour bookings')
        if (mounted) setTourBookings(data.tourBookings ?? [])
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load tour bookings')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  const stats = useMemo(() => {
    const pending = tourBookings.filter((booking) => booking.payment.status === 'pending').length
    const paid = tourBookings.filter((booking) => booking.payment.status === 'paid').length
    return { pending, paid }
  }, [tourBookings])

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
