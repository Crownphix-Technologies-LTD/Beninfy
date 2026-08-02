'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useSession, signOut } from 'next-auth/react'
import { formatNGN } from '@/lib/utils'
import { isAdminRole } from '@/lib/roles'
import PulseStatus, { DepartureRow } from '@/components/shared/PulseStatus'
import ProfileTab from './tabs/ProfileTab'
import SettingsTab from './tabs/SettingsTab'
import SupportTab from './tabs/SupportTab'

type TripStatus = 'confirmed' | 'pending' | 'completed' | 'active'

interface Trip {
  id: string
  ref: string
  from: string
  to: string
  date: string
  vehicle: string
  passengers: number
  amount: number
  status: TripStatus
  driver?: string
}

interface BookingApi {
  id: string
  from: string
  to: string
  date: string
  vehicleId: string
  passengers: number
  priceNGN: number
  status: string
}

interface PaymentApi {
  id: string
  reference: string
  amountNGN: number
  status: string
  createdAt: string
  booking: { id: string; from: string; to: string; date: string } | null
}

interface ProfileApi {
  id: string
  name: string | null
  email: string | null
  phone: string | null
}

type NavItem = 'dashboard' | 'profile' | 'payments' | 'support' | 'settings'

const LIVE_DEPARTURES = [
  { from: 'Lagos', to: 'Cotonou', time: '08:30', status: 'boarding' as const, vehicle: 'Executive SUV' },
  { from: 'Cotonou', to: 'Lome', time: '09:00', status: 'on-time' as const, vehicle: 'Toyota Sienna' },
  { from: 'Lagos', to: 'Accra', time: '10:15', status: 'delayed' as const, vehicle: 'Toyota Prado' },
  { from: 'Abuja', to: 'Lagos', time: '11:45', status: 'en-route' as const, vehicle: 'Saloon Car' },
]

const NAV_ITEMS: { id: NavItem; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'profile', label: 'Profile', icon: 'person' },
  { id: 'payments', label: 'Payments', icon: 'payments' },
  { id: 'support', label: 'Support', icon: 'support_agent' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

function statusBadge(status: string) {
  const normalized = status.toLowerCase()
  const tone =
    normalized === 'confirmed' || normalized === 'paid' || normalized === 'active'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
      : normalized === 'failed' || normalized === 'cancelled'
        ? 'bg-red-50 text-red-700 ring-red-100'
        : normalized === 'completed'
          ? 'bg-gray-100 text-gray-700 ring-gray-200'
          : 'bg-amber-50 text-amber-700 ring-amber-100'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function sectionTitle(title: string, subtitle?: string) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-normal text-[#3e004c]">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const locale = useLocale()
  const { data: session, status } = useSession()
  const sessionUser = session?.user as { id?: string; role?: string } | undefined
  const sessionRole = sessionUser?.role
  const [activeNav, setActiveNav] = useState<NavItem>('dashboard')
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [payments, setPayments] = useState<PaymentApi[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [now] = useState(() => Date.now())
  const [profile, setProfile] = useState<ProfileApi | null>(null)
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.href = `/${locale}/login`
      return
    }
    if (status !== 'authenticated') return
    if (!sessionUser?.id) {
      window.location.href = `/${locale}/login`
      return
    }
    if (isAdminRole(sessionRole)) {
      window.location.href = `/${locale}/admin`
      return
    }

    let cancelled = false
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true)
        return fetch('/api/bookings')
      })
      .then((r) => (r.ok ? r.json() : { bookings: [] }))
      .then((data: { bookings?: BookingApi[] }) => {
        if (cancelled) return
        const mapped: Trip[] = (data.bookings ?? []).map((b) => ({
          id: b.id,
          ref: `BFY-${b.id.slice(-8).toUpperCase()}`,
          from: b.from,
          to: b.to,
          date: b.date,
          vehicle: b.vehicleId,
          passengers: b.passengers,
          amount: b.priceNGN,
          status: (b.status as TripStatus) ?? 'pending',
        }))
        setTrips(mapped)
      })
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [status, locale, sessionRole, sessionUser?.id])

  useEffect(() => {
    if (activeNav !== 'payments' || status !== 'authenticated' || !sessionUser?.id || isAdminRole(sessionRole)) return

    let cancelled = false
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setPaymentsLoading(true)
        return fetch('/api/payments')
      })
      .then((r) => (r.ok ? r.json() : { payments: [] }))
      .then((data: { payments?: PaymentApi[] }) => {
        if (!cancelled) setPayments(data.payments ?? [])
      })
      .finally(() => !cancelled && setPaymentsLoading(false))

    return () => {
      cancelled = true
    }
  }, [activeNav, status, sessionRole, sessionUser?.id])

  useEffect(() => {
    if (status !== 'authenticated' || !sessionUser?.id || isAdminRole(sessionRole)) return

    let cancelled = false
    void fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: ProfileApi } | null) => {
        if (cancelled || !data?.user) return
        setProfile(data.user)
        setProfileForm({
          name: data.user.name ?? '',
          phone: data.user.phone ?? '',
        })
      })

    return () => {
      cancelled = true
    }
  }, [status, sessionRole, sessionUser?.id])

  const upcoming = trips.filter((t) => new Date(t.date).getTime() >= now && t.status !== 'completed')
  const history = trips.filter((t) => new Date(t.date).getTime() < now || t.status === 'completed')
  const totalSpend = trips.reduce((a, t) => a + t.amount, 0)
  const countriesVisited = new Set(trips.flatMap((trip) => [trip.from, trip.to]).filter(Boolean)).size

  const userName = session?.user?.name ?? session?.user?.email ?? 'Traveler'
  const firstName = userName.split(/[ @]/)[0] || 'Traveler'
  const initials = userName
    .split(/[ @._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'B'

  const handleCancel = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Cancel this booking?')) return
    setCancellingId(id)
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Cancel failed')
      setTrips((prev) => prev.filter((t) => t.id !== id))
    } finally {
      setCancellingId(null)
    }
  }

  const needsProfileCompletion = Boolean(profile && (!profile.name?.trim() || !profile.phone?.trim()))

  const handleProfileCompletion = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMessage(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileForm.name.trim() || undefined,
          phone: profileForm.phone.trim() ? profileForm.phone.trim() : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not update profile')
      setProfile(data.user)
      setProfileMessage('Account details saved.')
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : 'Could not update profile')
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f2f8]">
      <main className="mx-auto mt-16 max-w-[1320px] px-4 py-6 sm:px-6 md:px-10 lg:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-3">
            <div className="sticky top-24 space-y-4">
              <section className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
                <div className="relative bg-[#3e004c] p-5 text-white">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,#3e004c_0%,#672875_56%,#e0b94f_150%)]" />
                  <div className="relative flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-lg font-bold text-[#3e004c] shadow-sm">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{userName}</p>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/65">Beninfy member</p>
                    </div>
                  </div>
                  <div className="relative mt-4 flex gap-2">
                    <Link
                      href={`/${locale}/profile`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/12 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-white/18"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      Profile
                    </Link>
                    <button
                      onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/12 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-white/18"
                    >
                      <span className="material-symbols-outlined text-[16px]">logout</span>
                      Sign out
                    </button>
                  </div>
                </div>

                <nav className="space-y-1 p-3">
                  {NAV_ITEMS.map(({ id, label, icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveNav(id)}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors',
                        activeNav === id
                          ? 'bg-[#3e004c] text-white shadow-[0_12px_26px_rgba(62,0,76,0.16)]'
                          : 'text-gray-600 hover:bg-[#f7eff8] hover:text-[#3e004c]',
                      ].join(' ')}
                    >
                      <span className={activeNav === id ? 'material-symbols-outlined text-[20px] text-[#f4d66c]' : 'material-symbols-outlined text-[20px] text-[#7b3f89]'}>
                        {icon}
                      </span>
                      {label}
                    </button>
                  ))}
                </nav>
              </section>

              <section className="rounded-2xl border border-white/70 bg-white p-4 shadow-[0_14px_35px_rgba(62,0,76,0.07)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Your travel</p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Trips', value: trips.length },
                    { label: 'Upcoming', value: upcoming.length },
                    { label: 'Cities', value: countriesVisited || 0 },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-[#fbf7fc] p-3 text-center">
                      <p className="text-lg font-bold text-[#3e004c]">{stat.value}</p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl bg-[#fff7d6] px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#735c00]/70">Total spend</p>
                  <p className="mt-1 text-base font-bold text-[#735c00]">{formatNGN(totalSpend)}</p>
                </div>
              </section>

              <section className="rounded-2xl border border-white/70 bg-white p-4 shadow-[0_14px_35px_rgba(62,0,76,0.07)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Saved travelers</p>
                    <p className="text-xs text-gray-400">Fast booking profiles</p>
                  </div>
                  <span className="material-symbols-outlined text-[20px] text-[#7b3f89]">group</span>
                </div>
                <div className="mt-4 space-y-2">
                  {[{ init: 'AK', name: 'Abeba K.' }, { init: 'JM', name: 'Jean M.' }].map(({ init, name }) => (
                    <div key={name} className="flex items-center justify-between rounded-xl bg-[#fbf7fc] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3e004c] text-xs font-bold text-white">{init}</span>
                        <span className="text-sm font-medium text-gray-700">{name}</span>
                      </div>
                      <span className="material-symbols-outlined text-[17px] text-gray-400">edit</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </aside>

          <div className="space-y-6 lg:col-span-9">
            {activeNav === 'dashboard' && (
              <>
                <section className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
                  <div className="relative px-5 py-6 sm:px-6 md:px-8">
                    <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#3e004c,#7b3f89,#e0b94f)]" />
                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Traveler dashboard</p>
                        <h1 className="mt-2 text-2xl font-bold text-[#3e004c] md:text-3xl">Welcome back, {firstName}</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                          Track bookings, review payments, manage your profile, and get support for your cross-border trips.
                        </p>
                      </div>
                      <Link
                        href={`/${locale}/rides`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3e004c] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(62,0,76,0.18)] transition-colors hover:bg-[#50115f]"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Book a ride
                      </Link>
                    </div>
                  </div>
                </section>

                {needsProfileCompletion && (
                  <section className="overflow-hidden rounded-2xl border border-[#e0b94f]/40 bg-[#fff9df] shadow-[0_16px_45px_rgba(115,92,0,0.09)]">
                    <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_360px] lg:items-end">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined flex h-11 w-11 items-center justify-center rounded-xl bg-[#3e004c] text-[22px] text-[#f4d66c]">assignment_ind</span>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#735c00]/70">Complete your account</p>
                            <h2 className="mt-1 text-xl font-bold text-[#3e004c]">Add the details Google did not share</h2>
                          </div>
                        </div>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#735c00]/80">
                          We need these details for bookings, driver coordination, and border support. You only have to do this once.
                        </p>
                      </div>
                      <form onSubmit={handleProfileCompletion} className="space-y-3">
                        {!profile?.name?.trim() && (
                          <input
                            type="text"
                            value={profileForm.name}
                            onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                            className="w-full rounded-xl border border-[#eadb9b] bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#3e004c] focus:ring-2 focus:ring-[#3e004c]/15"
                            placeholder="Full name"
                            required
                          />
                        )}
                        <input
                          type="tel"
                          value={profileForm.phone}
                          onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                          className="w-full rounded-xl border border-[#eadb9b] bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#3e004c] focus:ring-2 focus:ring-[#3e004c]/15"
                          placeholder="Phone number, e.g. +234 801 234 5678"
                          required
                        />
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="submit"
                            disabled={profileSaving}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#3e004c] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#50115f] disabled:cursor-wait disabled:opacity-60"
                          >
                            <span className="material-symbols-outlined text-[17px]">{profileSaving ? 'progress_activity' : 'save'}</span>
                            {profileSaving ? 'Saving...' : 'Save details'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveNav('profile')}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#eadb9b] bg-white px-4 py-3 text-sm font-semibold text-[#3e004c] transition-colors hover:bg-[#fffdf2]"
                          >
                            Full profile
                          </button>
                        </div>
                        {profileMessage && <p className="text-xs font-medium text-[#735c00]">{profileMessage}</p>}
                      </form>
                    </div>
                  </section>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[
                    { label: 'Upcoming trips', value: upcoming.length, icon: 'event_available', tone: 'bg-emerald-50 text-emerald-700' },
                    { label: 'Completed trips', value: history.length, icon: 'verified', tone: 'bg-sky-50 text-sky-700' },
                    { label: 'Total paid', value: formatNGN(totalSpend), icon: 'payments', tone: 'bg-[#fff7d6] text-[#735c00]' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl border border-white/70 bg-white p-5 shadow-[0_14px_35px_rgba(62,0,76,0.07)]">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{stat.label}</p>
                        <span className={`material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-xl text-[20px] ${stat.tone}`}>{stat.icon}</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-950">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <section className="rounded-2xl border border-white/70 bg-white p-5 shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      {sectionTitle('Upcoming Trips', 'Trips that need your attention.')}
                      <Link href={`/${locale}/rides`} className="text-sm font-semibold text-[#3e004c] hover:underline">New trip</Link>
                    </div>

                    <div className="space-y-3">
                      {loading && <p className="py-8 text-center text-sm text-gray-400">Loading trips...</p>}
                      {upcoming.length === 0 && !loading && (
                        <div className="rounded-2xl border border-dashed border-[#eaddec] bg-[#fbf7fc] p-6 text-center">
                          <span className="material-symbols-outlined text-[34px] text-[#7b3f89]">route</span>
                          <p className="mt-2 text-sm font-semibold text-gray-900">No upcoming trips yet</p>
                          <p className="mt-1 text-xs text-gray-500">Book a private ride when you are ready.</p>
                        </div>
                      )}
                      {upcoming.map((trip) => (
                        <div key={trip.id} className="rounded-2xl border border-[#eaddec] bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 gap-3">
                              <span className="material-symbols-outlined flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7eff8] text-[21px] text-[#3e004c]">airport_shuttle</span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-gray-950">{trip.from} → {trip.to}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {new Date(trip.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {statusBadge(trip.status)}
                                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">{trip.vehicle}</span>
                                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">{trip.passengers} pax</span>
                                </div>
                              </div>
                            </div>
                            <p className="shrink-0 text-sm font-bold text-[#735c00]">{formatNGN(trip.amount)}</p>
                          </div>
                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleCancel(trip.id)}
                              disabled={cancellingId === trip.id}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                              {cancellingId === trip.id ? 'Cancelling...' : 'Cancel booking'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/70 bg-white p-5 shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      {sectionTitle('Booking History', 'Completed and past trips.')}
                      <button type="button" className="text-sm font-semibold text-[#3e004c] hover:underline">View all</button>
                    </div>
                    <div className="space-y-3">
                      {history.length === 0 && !loading && (
                        <div className="rounded-2xl border border-dashed border-[#eaddec] bg-[#fbf7fc] p-6 text-center">
                          <span className="material-symbols-outlined text-[34px] text-gray-400">history</span>
                          <p className="mt-2 text-sm font-semibold text-gray-900">No past trips yet</p>
                        </div>
                      )}
                      {history.map((trip) => (
                        <div key={trip.id} className="rounded-2xl border border-gray-100 bg-[#fbf7fc] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-950">{trip.from} → {trip.to}</p>
                              <p className="mt-1 text-xs text-gray-500">{new Date(trip.date).toLocaleDateString('en-GB')}</p>
                              <p className="mt-1 text-[11px] font-medium text-gray-400">#{trip.ref}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold text-gray-900">{formatNGN(trip.amount)}</p>
                              <div className="mt-2">{statusBadge(trip.status)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-[0_16px_45px_rgba(0,0,0,0.18)]">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[22px] text-yellow-400">departure_board</span>
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Live Departures</h3>
                    </div>
                    <PulseStatus status="en-route" />
                  </div>
                  <div className="space-y-2">
                    {LIVE_DEPARTURES.map((dep) => (
                      <DepartureRow
                        key={dep.time}
                        from={dep.from}
                        to={dep.to}
                        time={dep.time}
                        status={dep.status}
                        vehicle={dep.vehicle}
                      />
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-white/70 bg-white p-5 shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
                  <div className="mb-4">{sectionTitle('Quick Actions', 'Common travel tasks in one place.')}</div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                      { icon: 'directions_car', label: 'Book a Ride', href: `/${locale}/rides` },
                      { icon: 'map', label: 'Explore Tours', href: `/${locale}/tours` },
                      { icon: 'security', label: 'Border Info', href: `/${locale}/border-info` },
                      { icon: 'support_agent', label: 'Get Support', href: 'https://wa.me/22951019134' },
                    ].map(({ icon, label, href }) => (
                      <a
                        key={label}
                        href={href}
                        target={href.startsWith('https') ? '_blank' : '_self'}
                        rel={href.startsWith('https') ? 'noopener noreferrer' : undefined}
                        className="group flex flex-col items-center gap-3 rounded-2xl border border-[#eaddec] bg-[#fbf7fc] p-4 text-center transition-colors hover:border-[#3e004c] hover:bg-white"
                      >
                        <span className="material-symbols-outlined text-[28px] text-[#3e004c] transition-transform group-hover:scale-110">{icon}</span>
                        <span className="text-sm font-semibold text-gray-800">{label}</span>
                      </a>
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeNav === 'profile' && <ProfileTab />}
            {activeNav === 'settings' && <SettingsTab />}
            {activeNav === 'support' && <SupportTab />}
            {activeNav === 'payments' && (
              <section className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
                <div className="flex flex-col gap-3 border-b border-gray-100 bg-[#fbf7fc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>{sectionTitle('Payment history', 'Review your payment references and status.')}</div>
                  <button
                    onClick={() => setActiveNav('dashboard')}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#eaddec] bg-white px-3 py-2 text-sm font-semibold text-[#3e004c] transition-colors hover:bg-[#f7eff8]"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                    Dashboard
                  </button>
                </div>
                {paymentsLoading ? (
                  <p className="p-6 text-sm text-gray-500">Loading payments...</p>
                ) : payments.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500">No payments yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#fbf7fc] text-xs uppercase tracking-[0.14em] text-gray-500">
                        <tr>
                          <th className="px-5 py-3.5 text-left font-semibold">Reference</th>
                          <th className="px-5 py-3.5 text-left font-semibold">Booking</th>
                          <th className="px-5 py-3.5 text-left font-semibold">Amount</th>
                          <th className="px-5 py-3.5 text-left font-semibold">Status</th>
                          <th className="px-5 py-3.5 text-left font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.id} className="border-t border-gray-100">
                            <td className="px-5 py-4"><code className="rounded-lg bg-[#fbf7fc] px-2 py-1 text-xs text-gray-700">{p.reference}</code></td>
                            <td className="px-5 py-4 text-gray-700">{p.booking ? `${p.booking.from} → ${p.booking.to}` : '—'}</td>
                            <td className="px-5 py-4 font-semibold text-gray-900">{formatNGN(p.amountNGN)}</td>
                            <td className="px-5 py-4">{statusBadge(p.status)}</td>
                            <td className="px-5 py-4 text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
