import Link from 'next/link'
import { findRoute } from '@/data/routes'
import { getRouteDropoffPrice } from '@/data/pricing'
import { getRouteBorderFee } from '@/data/borderFees'
import { formatNGN } from '@/lib/utils'
import { getPublicVehicles } from '@/lib/vehicleCatalog'
import ConfirmationHeader from '@/components/booking/ConfirmationHeader'
import PulseStatus from '@/components/shared/PulseStatus'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPaymentConfigurationError, settlePaymentFromPayOnUs, verifyPayOnUsPayment } from '@/lib/payonus'
import {
  getPaystackConfigurationError,
  getPaystackSecret,
  settlePaymentFromPaystack,
  verifyPaystackTransaction,
} from '@/lib/paystack'
import { getRoutePriceOverrides } from '@/lib/routePriceOverrides'
import { getFleetVehicleDisplayLabel } from '@/lib/fleetDisplay'
import { isAdminRole } from '@/lib/roles'
import type { VehicleId, RouteId } from '@/types'

export const runtime = 'nodejs'

interface Props {
  params: Promise<{ locale: string }>
  searchParams: Promise<{
    id?: string
    vehicle?: string
    fleetVehicle?: string
    from?: string
    to?: string
    date?: string
    ref?: string
    reference?: string
    providerRef?: string
    currencyCode?: string
    name?: string
    tripType?: string
  }>
}

export default async function BookingConfirmedPage({ params, searchParams }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const sp = await searchParams
  const t = await getTranslations('confirmedPage')
  const session = await auth()
  const sessionRole = (session?.user as { role?: string } | undefined)?.role
  const customerUserId = session?.user?.id && !isAdminRole(sessionRole) ? session.user.id : null
  const paymentReference = sp.reference ?? sp.ref
  const providerReference = sp.providerRef

  let dbBooking: Awaited<ReturnType<typeof prisma.booking.findUnique>> = null

  if (paymentReference && customerUserId) {
    const payment = await prisma.payment.findUnique({
      where: { reference: paymentReference },
      include: { booking: true },
    })
    if (payment?.booking.userId === customerUserId) {
      const onusReference = providerReference || payment.providerReference
      if (payment.provider === 'paystack' && payment.status !== 'paid') {
        const secret = getPaystackSecret()
        if (!getPaystackConfigurationError() && secret) {
          try {
            const verified = await verifyPaystackTransaction(secret, paymentReference)
            await settlePaymentFromPaystack(paymentReference, verified)
          } catch {
            // Keep the page renderable; dashboard/webhook can still reflect final status.
          }
        }
      } else if (!getPaymentConfigurationError() && onusReference && payment.status !== 'paid') {
        try {
          const verified = await verifyPayOnUsPayment(onusReference)
          await settlePaymentFromPayOnUs(paymentReference, onusReference, verified)
        } catch {
          // Keep the page renderable; dashboard/webhook can still reflect final status.
        }
      }
      dbBooking = await prisma.booking.findUnique({ where: { id: payment.bookingId } })
    }
  }

  if (!dbBooking && sp.id && customerUserId) {
    const found = await prisma.booking.findUnique({ where: { id: sp.id } })
    if (found && found.userId === customerUserId) {
      dbBooking = found
    }
  }

  const vehicleId = (dbBooking?.vehicleId ?? sp.vehicle ?? 'saloon') as VehicleId
  const selectedFleetVehicleId = sp.fleetVehicle || undefined
  const from = dbBooking?.from ?? sp.from ?? 'Lagos'
  const to = dbBooking?.to ?? sp.to ?? 'Cotonou'
  const date = dbBooking ? dbBooking.date.toISOString() : (sp.date ?? '')
  const tripType = dbBooking?.tripType === 'round_trip' || sp.tripType === 'round-trip' ? 'round-trip' : 'one-way'
  const bookingRef = paymentReference ?? (dbBooking ? `BFY-${dbBooking.id.slice(-8).toUpperCase()}` : 'BFY-PENDING')
  const passengerName = sp.name ?? 'Passenger'

  const vehicles = await getPublicVehicles({ availableOnly: false })
  const vehicle = vehicles.find((v) => v.id === vehicleId)
  const bookingLegs = dbBooking
    ? await prisma.bookingLeg.findMany({
        where: { bookingId: dbBooking.id },
        orderBy: { departureDate: 'asc' },
        include: { fleetVehicle: { select: { id: true, label: true } } },
      })
    : []
  const selectedFleetVehicle = selectedFleetVehicleId
    ? await prisma.fleetVehicle.findUnique({ where: { id: selectedFleetVehicleId }, select: { id: true, label: true } })
    : null
  const displayFleetVehicle = bookingLegs[0]?.fleetVehicle ?? selectedFleetVehicle
  const vehicleDisplayName = displayFleetVehicle ? getFleetVehicleDisplayLabel(displayFleetVehicle.label) : vehicle?.name
  const matchedRoute = findRoute(from, to)
  const legCount = tripType === 'round-trip' ? 2 : 1
  const routePriceOverrides = matchedRoute ? await getRoutePriceOverrides(matchedRoute.id) : undefined
  const fallbackDropoff = matchedRoute
    ? getRouteDropoffPrice(
        matchedRoute.id as RouteId,
        (displayFleetVehicle?.id ?? vehicleId) as VehicleId,
        displayFleetVehicle?.label ?? vehicle?.name,
        undefined,
        routePriceOverrides
      )
    : 120000
  const fallbackRideFare = (fallbackDropoff ?? 0) * legCount
  const borderFee = matchedRoute ? getRouteBorderFee(matchedRoute.id as RouteId, tripType) : 0
  const total = dbBooking?.priceNGN ?? (fallbackRideFare + borderFee)
  const basePrice = dbBooking ? Math.max(0, dbBooking.priceNGN - borderFee) : fallbackRideFare

  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'Date TBC'

  return (
    <div className="min-h-screen" style={{ background: '#f4f2f8' }}>
      <div className="pt-24 pb-20 relative overflow-hidden">
        {/* Celebration gradient */}
        <div className="absolute top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none" />

        <div className="max-w-[860px] mx-auto px-4 md:px-6">
          {/* Success header */}
          <ConfirmationHeader passengerName={passengerName} bookingRef={bookingRef} />

          {/* Main bento grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Trip summary card */}
            <div className="md:col-span-8 bg-white rounded-2xl p-7 shadow-sm border border-gray-100 flex flex-col gap-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">{t('tripSummary')}</h2>
                <div className="flex items-center gap-2">
                  <PulseStatus status="on-time" />
                  <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider" style={{ background: '#f3e8f8', color: '#3e004c' }}>{t('premiumTransit')}</span>
                </div>
              </div>

              {/* Route display */}
              <div className="flex items-center gap-6 py-5 border-y border-gray-100">
                <div className="flex flex-col items-center gap-1">
                  <span className="material-symbols-outlined text-[20px]" style={{ color: '#3e004c' }}>radio_button_checked</span>
                  <div className="w-0.5 h-12 bg-gray-200" />
                  <span className="material-symbols-outlined text-[20px]" style={{ color: '#735c00' }}>location_on</span>
                </div>
                <div className="flex flex-col gap-5 w-full">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-0.5">{t('pickup')}</p>
                    <p className="text-base font-semibold text-gray-900">{from}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-0.5">{t('destination')}</p>
                    <p className="text-base font-semibold text-gray-900">{to}</p>
                  </div>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="material-symbols-outlined text-gray-400 text-[20px] mb-2 block">calendar_month</span>
                  <p className="text-xs text-gray-500">{t('dateTime')}</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">{formattedDate}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="material-symbols-outlined text-gray-400 text-[20px] mb-2 block">airport_shuttle</span>
                  <p className="text-xs text-gray-500">{t('vehicleClass')}</p>
                  <p className="text-sm font-medium text-gray-900 mt-1">{vehicleDisplayName ?? vehicleId}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 col-span-2 md:col-span-1">
                  <span className="material-symbols-outlined text-gray-400 text-[20px] mb-2 block">payments</span>
                  <p className="text-xs text-gray-500">{t('totalPaid')}</p>
                  <p className="text-sm font-medium mt-1" style={{ color: '#735c00' }}>{formatNGN(total)}</p>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="space-y-2 text-sm pt-1 border-t border-gray-100">
                <div className="flex justify-between">
                  <span className="text-gray-500">{tripType === 'round-trip' ? `${t('rideFare')} (drop-off x 2)` : `${t('rideFare')} (drop-off)`}</span>
                  <span className="text-gray-900">{formatNGN(basePrice ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('borderFee')}</span>
                  <span className="text-gray-900">{formatNGN(borderFee)}</span>
                </div>
              </div>
            </div>

            {/* What's next card */}
            <div className="md:col-span-4 rounded-2xl p-7 shadow-lg flex flex-col gap-5" style={{ background: '#3e004c', color: '#fff' }}>
              <h3 className="text-base font-bold">{t('whatsNext')}</h3>
              <p className="text-sm opacity-90">
                {t('whatsNextDesc', { hours: '2' })}
              </p>
              <div className="mt-auto pt-5 flex flex-col gap-4 border-t border-white/20">
                {[
                  { icon: 'verified_user', text: t('check1') },
                  { icon: 'health_and_safety', text: t('check2') },
                  { icon: 'support_agent', text: t('check3') },
                  { icon: 'security', text: t('check4') },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[18px]" style={{ color: '#ffd77a' }}>{icon}</span>
                    <p className="text-xs">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="md:col-span-12 flex flex-col md:flex-row items-center justify-center gap-4 pt-4">
              <Link
                href={`/${locale}/dashboard`}
                className="w-full md:w-auto px-8 py-4 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg"
                style={{ background: '#3e004c' }}
              >
                <span className="material-symbols-outlined text-[20px]">dashboard</span>
                {t('goDashboard')}
              </Link>
              <button
                onClick={() => window.print()}
                className="w-full md:w-auto px-8 py-4 rounded-xl text-sm font-semibold border-2 hover:opacity-80 transition-all flex items-center justify-center gap-2"
                style={{ color: '#735c00', borderColor: '#735c00' }}
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                {t('downloadReceipt')}
              </button>
              <a
                href={`https://wa.me/2348000000000?text=My+Beninfy+booking+reference+is+%23${bookingRef}.+I+need+assistance.`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full md:w-auto px-8 py-4 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-500 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">chat</span>
                {t('whatsappSupport')}
              </a>
            </div>
          </div>

          {/* Support footer */}
          <div className="mt-16 text-center">
            <p className="text-sm text-gray-400 mb-4">{t('needHelp')}</p>
            <div className="flex items-center justify-center gap-6">
              <a href={`/${locale}/about#contact`} className="flex items-center gap-2 text-sm font-medium hover:underline" style={{ color: '#3e004c' }}>
                <span className="material-symbols-outlined text-[18px]">support_agent</span>
                {t('contactConcierge')}
              </a>
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
              <a href={`/${locale}/border-info`} className="flex items-center gap-2 text-sm font-medium hover:underline" style={{ color: '#3e004c' }}>
                <span className="material-symbols-outlined text-[18px]">help_outline</span>
                {t('borderFaq')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
