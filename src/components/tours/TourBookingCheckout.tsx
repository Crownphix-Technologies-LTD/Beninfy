'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  BadgeCheck,
  CalendarDays,
  CarFront,
  CheckCircle2,
  Clock3,
  CreditCard,
  MapPin,
  RefreshCw,
  Tag,
} from 'lucide-react'

type Money = { value: number; currency: string }
type Booking = {
  id: string
  reference: string
  selectedTourIds: string[]
  status: string
  quoteStatus: string
  itineraryMode: string
  customItinerary: string | null
  startDate: string
  endDate: string
  travellers: number
  vehicleCategory: { id: string; name: string; capacity: number } | null
  pickup: { label: string | null; address: string | null }
  pricing: { subtotal: Money; discount: Money; total: Money; coupon: unknown }
  payment: { status: string; canInitialize: boolean }
  tour: { title: string; titleFr: string | null }
  days: Array<{
    id: string
    dayNumber: number
    sourceTourTitle?: string | null
    scheduledDate: string
  }>
}

type PayOnUsResult = {
  reference?: string
  onusReference?: string
  amount?: number
  method?: string
  status?: string
}
type PayOnUsError = { error?: string; code?: string }
type PayOnUsConfig = {
  businessId: string
  amount: number
  currency: 'NGN'
  customerEmail: string
  customerName: string
  customerPhone: string
  merchantCheckoutReference: string
  countryCode: 'NG'
  notificationUrl: string
  redirectUrl: string
  environment: 'test' | 'production'
  paymentMethods: Array<'card' | 'bank' | 'palmpay' | 'opay'>
  onSuccess: (result: PayOnUsResult) => void
  onError: (error: PayOnUsError) => void
  onClose: () => void
}

type Payment = {
  status: string
  paymentReference: string | null
  checkout: null | { authorizationUrl?: string | null; checkoutUrl?: string | null }
  checkoutConfig?: Omit<PayOnUsConfig, 'onSuccess' | 'onError' | 'onClose'> | null
}

declare global {
  interface Window {
    OnUsCheckout?: { init: () => void; checkout: (config: PayOnUsConfig) => void }
  }
}

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value)
}

function apiError(payload: unknown) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { message?: string; code?: string } }).error
    return error?.message || error?.code || 'Request failed.'
  }
  return 'Request failed.'
}

function loadPayOnUs() {
  return new Promise<void>((resolve, reject) => {
    if (window.OnUsCheckout) return resolve()
    const existing = document.querySelector<HTMLScriptElement>('script[data-payonus-checkout]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Could not load PayOnUs checkout')),
        { once: true }
      )
      return
    }
    const script = document.createElement('script')
    script.src = 'https://payonus.com/checkout-v2.min.js'
    script.async = true
    script.dataset.payonusCheckout = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load PayOnUs checkout'))
    document.head.appendChild(script)
  })
}

export default function TourBookingCheckout({
  bookingId,
  locale,
}: {
  bookingId: string
  locale: string
}) {
  const searchParams = useSearchParams()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [coupon, setCoupon] = useState('')
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/tour-bookings/${bookingId}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(apiError(payload))
    setBooking((payload as { tourBooking: Booking }).tourBooking)
  }, [bookingId])

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref')
    const providerReference =
      searchParams.get('providerReference') || searchParams.get('transactionReference')
    const settle = async () => {
      if (reference || providerReference) {
        await fetch(`/api/tour-bookings/${bookingId}/payment/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: reference || undefined,
            providerReference: providerReference || undefined,
          }),
        })
      }
      await load()
    }
    settle()
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load booking'))
      .finally(() => setLoading(false))
  }, [bookingId, load, searchParams])

  async function updateCoupon(remove = false) {
    setAction('coupon')
    setError(null)
    const response = await fetch(`/api/tour-bookings/${bookingId}/coupon`, {
      method: remove ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(remove ? {} : { body: JSON.stringify({ code: coupon }) }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) setError(apiError(payload))
    else {
      setCoupon('')
      await load()
    }
    setAction(null)
  }

  async function pay(provider: 'paystack' | 'payonus') {
    setAction(provider)
    setError(null)
    const response = await fetch(`/api/tour-bookings/${bookingId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, locale: locale === 'fr' ? 'fr' : 'en' }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(apiError(payload))
      setAction(null)
      return
    }
    const payment = (payload as { payment: Payment }).payment
    if (payload && (payload as { zeroPayable?: boolean }).zeroPayable) {
      await load()
      setAction(null)
      return
    }
    if (provider === 'paystack') {
      const url = payment.checkout?.authorizationUrl || payment.checkout?.checkoutUrl
      if (!url) {
        setError('Paystack checkout is unavailable.')
        setAction(null)
        return
      }
      window.location.assign(url)
      return
    }
    try {
      await loadPayOnUs()
      if (!window.OnUsCheckout || !payment.checkoutConfig)
        throw new Error('PayOnUs checkout is unavailable.')
      window.OnUsCheckout.checkout({
        ...payment.checkoutConfig,
        onSuccess: async (result) => {
          await fetch(`/api/tour-bookings/${bookingId}/payment/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: payment.paymentReference,
              providerReference: result.onusReference || result.reference,
            }),
          })
          await load()
          setAction(null)
        },
        onError: (checkoutError) => {
          setError(checkoutError.error || 'Payment could not be completed.')
          setAction(null)
        },
        onClose: () => setAction(null),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open checkout.')
      setAction(null)
    }
  }

  if (loading)
    return (
      <main className="min-h-screen bg-[#f7f6f8] pt-28">
        <div className="mx-auto max-w-4xl px-4">
          <div className="h-64 animate-pulse rounded-lg bg-white" />
        </div>
      </main>
    )
  if (!booking)
    return (
      <main className="min-h-screen bg-[#f7f6f8] pt-28">
        <div className="mx-auto max-w-3xl px-4">
          <p className="rounded-lg bg-white p-6 text-red-700">{error || 'Booking not found.'}</p>
        </div>
      </main>
    )

  const paid = booking.payment.status === 'paid'
  const quotePending = booking.quoteStatus === 'pending'
  return (
    <main className="min-h-screen bg-[#f7f6f8] pt-16 text-[#201a22]">
      <section className="border-b border-[#e4dfe6] bg-white">
        <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-10 md:py-12">
          <div className="text-primary flex flex-wrap items-center gap-2 text-xs font-bold uppercase">
            <BadgeCheck size={16} /> Tour booking{' '}
            <span className="text-[#675d69]">{booking.reference}</span>
          </div>
          <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-bold md:text-4xl">
                {locale === 'fr' ? booking.tour.titleFr || booking.tour.title : booking.tour.title}
              </h1>
              <p className="mt-2 text-sm text-[#675d69]">
                {booking.days.length} Tour day{booking.days.length === 1 ? '' : 's'} ·{' '}
                {booking.travellers} traveller{booking.travellers === 1 ? '' : 's'}
              </p>
            </div>
            <span
              className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${paid ? 'bg-emerald-100 text-emerald-800' : quotePending ? 'bg-amber-100 text-amber-800' : 'text-primary bg-[#eee8f0]'}`}
            >
              {paid ? 'Payment confirmed' : quotePending ? 'Quote under review' : 'Payment pending'}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1120px] gap-7 px-4 py-8 md:px-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-7">
          <section className="border-b border-[#ddd6df] pb-7">
            <h2 className="text-lg font-bold">Itinerary</h2>
            <div className="mt-4 space-y-3">
              {booking.days.map((day) => (
                <div
                  key={day.id}
                  className="flex gap-4 rounded-lg border border-[#ddd6df] bg-white p-4"
                >
                  <span className="bg-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
                    {day.dayNumber}
                  </span>
                  <div>
                    <strong className="block">
                      {day.sourceTourTitle || `Tour day ${day.dayNumber}`}
                    </strong>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-[#675d69]">
                      <CalendarDays size={13} />
                      {new Date(day.scheduledDate).toLocaleDateString(locale, {
                        dateStyle: 'long',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="grid gap-4 border-b border-[#ddd6df] pb-7 sm:grid-cols-2">
            <div className="flex gap-3">
              <MapPin className="text-primary shrink-0" size={19} />
              <div>
                <span className="text-xs font-bold text-[#675d69] uppercase">Pickup</span>
                <p className="mt-1 text-sm font-semibold">
                  {booking.pickup.label || booking.pickup.address}
                </p>
                <p className="mt-1 text-xs text-[#675d69]">{booking.pickup.address}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <CarFront className="text-primary shrink-0" size={19} />
              <div>
                <span className="text-xs font-bold text-[#675d69] uppercase">Vehicle</span>
                <p className="mt-1 text-sm font-semibold">{booking.vehicleCategory?.name}</p>
                <p className="mt-1 text-xs text-[#675d69]">
                  Capacity {booking.vehicleCategory?.capacity}
                </p>
              </div>
            </div>
          </section>
          {booking.itineraryMode === 'custom' && (
            <section>
              <h2 className="text-lg font-bold">Custom request</h2>
              <p className="mt-3 rounded-lg border border-[#ddd6df] bg-white p-4 text-sm leading-6 whitespace-pre-wrap">
                {booking.customItinerary}
              </p>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-lg border border-[#ddd6df] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Payment summary</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#675d69]">Subtotal</dt>
                <dd>{money(booking.pricing.subtotal.value, locale)}</dd>
              </div>
              {booking.pricing.discount.value > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount</dt>
                  <dd>-{money(booking.pricing.discount.value, locale)}</dd>
                </div>
              )}
              <div className="flex items-end justify-between border-t border-[#ebe6ec] pt-4">
                <dt className="font-bold">Total</dt>
                <dd className="text-primary text-2xl font-bold">
                  {quotePending ? 'Awaiting quote' : money(booking.pricing.total.value, locale)}
                </dd>
              </div>
            </dl>
            {!paid && !quotePending && (
              <div className="mt-5 border-t border-[#ebe6ec] pt-5">
                <label className="text-xs font-bold text-[#675d69] uppercase">Coupon code</label>
                <div className="mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Tag size={15} className="absolute top-3 left-3 text-[#675d69]" />
                    <input
                      value={coupon}
                      onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                      className="focus:border-primary h-10 w-full rounded-md border border-[#cfc6d1] pr-2 pl-9 text-sm outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!coupon.trim() || action === 'coupon'}
                    onClick={() => updateCoupon()}
                    className="border-primary text-primary rounded-md border px-3 text-sm font-semibold disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
                {booking.pricing.coupon != null && (
                  <button
                    type="button"
                    onClick={() => updateCoupon(true)}
                    className="text-primary mt-2 text-xs font-semibold underline"
                  >
                    Remove coupon
                  </button>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {paid ? (
              <div className="mt-5 flex items-center gap-3 rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                <CheckCircle2 size={20} />
                Your Tour is confirmed.
              </div>
            ) : quotePending ? (
              <div className="mt-5 flex gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                <Clock3 className="shrink-0" size={19} />
                Operations will approve your itinerary and final price before payment becomes
                available.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  disabled={Boolean(action)}
                  onClick={() => pay('paystack')}
                  className="bg-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-lg font-semibold text-white disabled:opacity-50"
                >
                  <CreditCard size={18} />
                  Pay with Paystack
                </button>
                <button
                  type="button"
                  disabled={Boolean(action)}
                  onClick={() => pay('payonus')}
                  className="border-primary text-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border font-semibold disabled:opacity-50"
                >
                  <CreditCard size={18} />
                  Pay via PayOnUs
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setAction('refresh')
                load()
                  .catch((err) => setError(err.message))
                  .finally(() => setAction(null))
              }}
              className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 text-xs font-semibold text-[#675d69]"
            >
              <RefreshCw size={14} />
              Refresh status
            </button>
          </div>
          <Link
            href={`/${locale}/tours`}
            className="text-primary mt-4 block text-center text-sm font-semibold"
          >
            Book another Tour
          </Link>
        </aside>
      </div>
    </main>
  )
}
