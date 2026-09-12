import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import {
  getPaymentConfigurationError,
  getPayOnUsBusinessId,
  getPayOnUsEnvironment,
  normalizePayOnUsPhone,
  settlePaymentFromPayOnUs,
  verifyPayOnUsPayment,
  type PayOnUsPaymentMethod,
} from '@/lib/payonus'
import {
  getPaystackConfigurationError,
  getPaystackSecret,
  initializePaystackTransaction,
  settlePaymentFromPaystack,
  verifyPaystackTransaction,
} from '@/lib/paystack'
import {
  MOBILE_LAUNCH_CURRENCY,
  assertMobileLaunchCurrency,
  normalizeMobileLaunchPaymentProvider,
  type MobileLaunchPaymentProvider,
} from '@/lib/mobile/paymentPolicy'
import { toTourBookingDto } from '@/lib/mobile/tourBookings'

export type TourPaymentProvider = MobileLaunchPaymentProvider

type TourPaymentForDto = {
  id: string
  bookingId: string | null
  tourBookingId: string | null
  amountNGN: number
  status: string
  reference: string
  provider: string
  providerReference: string | null
  providerCheckoutUrl: string | null
  providerAccessCode: string | null
  currencyCode: string
  checkoutAmount: number | null
  expiresAt: Date | null
  paidAt: Date | null
  failureCode: string | null
  createdAt: Date
  updatedAt: Date
}

type TourBookingForPayment = {
  id: string
  userId: string
  reference: string
  status: string
  paymentStatus: string
  currencyCode: string
  priceNGN: number
  amountPaidNGN: number
  paymentProvider: string | null
  paymentReference: string | null
  tourTitle: string
  travellers: number
  user: { id: string; name: string | null; email: string | null; phone: string | null }
  payments: TourPaymentForDto[]
}

function paymentExpiresAt() {
  return new Date(Date.now() + 30 * 60 * 1000)
}

function activePendingPayment(payments: TourPaymentForDto[], provider: TourPaymentProvider) {
  return payments.find((payment) => payment.provider === provider && payment.status === 'pending') ?? null
}

function successfulPayment(payments: TourPaymentForDto[]) {
  return payments.find((payment) => payment.status === 'paid') ?? null
}

export function tourPaymentState(input: { bookingStatus: string; paymentStatus: string }) {
  if (input.paymentStatus === 'paid') return 'paid'
  if (input.paymentStatus === 'failed') return 'failed'
  if (input.paymentStatus === 'amount_mismatch') return 'amount_mismatch'
  return 'pending'
}

export function tourBookingPayable(booking: { status: string; paymentStatus: string; priceNGN: number }) {
  return booking.priceNGN > 0 && booking.status === 'payment_pending' && booking.paymentStatus === 'pending'
}

export function tourCouponsSupported() {
  return false
}

export function normalizeTourPaymentProvider(value: unknown): TourPaymentProvider {
  return normalizeMobileLaunchPaymentProvider(value)
}

export function toTourPaymentDto({
  booking,
  payment,
}: {
  booking: { id: string; reference: string; status: string; paymentStatus: string; priceNGN: number }
  payment: TourPaymentForDto | null
}) {
  const status =
    payment?.status ??
    tourPaymentState({ bookingStatus: booking.status, paymentStatus: booking.paymentStatus })
  const amountNGN = payment?.amountNGN ?? booking.priceNGN
  return {
    paymentId: payment?.id ?? null,
    tourBookingId: booking.id,
    tourReference: booking.reference,
    status,
    amount: {
      value: amountNGN,
      currency: payment?.currencyCode ?? MOBILE_LAUNCH_CURRENCY,
      minorUnit: 'kobo',
      minorValue: amountNGN * 100,
    },
    provider: payment?.provider ?? null,
    paymentReference: payment?.reference ?? null,
    providerReference: payment?.providerReference ?? null,
    checkout: payment
      ? {
          mode: payment.provider === 'payonus' ? 'payonus_checkout' : 'hosted_checkout',
          checkoutUrl: payment.providerCheckoutUrl,
          authorizationUrl: payment.providerCheckoutUrl,
          accessCode: payment.providerAccessCode,
        }
      : null,
    expiresAt: payment?.expiresAt?.toISOString() ?? null,
    paidAt: payment?.paidAt?.toISOString() ?? null,
    canRetry:
      booking.status === 'payment_pending' &&
      (status === 'failed' || status === 'amount_mismatch' || !payment),
    failureCode: payment?.failureCode ?? null,
    couponsSupported: tourCouponsSupported(),
    updatedAt: payment?.updatedAt.toISOString() ?? null,
  }
}

function payOnUsTourCheckoutConfig({
  origin,
  locale,
  booking,
  payment,
}: {
  origin: string
  locale: 'en' | 'fr'
  booking: TourBookingForPayment
  payment: TourPaymentForDto
}) {
  const businessId = getPayOnUsBusinessId()
  if (!businessId) return null
  return {
    businessId,
    amount: booking.priceNGN,
    currency: MOBILE_LAUNCH_CURRENCY,
    customerEmail: booking.user.email || `tour-${booking.id}@beninfy.com`,
    customerName: booking.user.name || 'Beninfy Customer',
    customerPhone: normalizePayOnUsPhone(booking.user.phone || ''),
    merchantCheckoutReference: payment.reference,
    countryCode: 'NG' as const,
    notificationUrl: `${origin}/api/payments/webhook`,
    redirectUrl: `${origin}/${locale}/dashboard`,
    environment: getPayOnUsEnvironment(),
    paymentMethods: ['card', 'bank', 'palmpay', 'opay'] satisfies PayOnUsPaymentMethod[],
  }
}

async function ownedTourBooking(tourBookingId: string, principal: MobilePrincipal) {
  return prisma.tourBooking.findFirst({
    where: { id: tourBookingId, userId: principal.userId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      days: { orderBy: { dayNumber: 'asc' }, include: { stops: { orderBy: { sortOrder: 'asc' } } } },
    },
  })
}

export async function getMobileTourBookingPayment({
  tourBookingId,
  principal,
}: {
  tourBookingId: string
  principal: MobilePrincipal
}) {
  const booking = await ownedTourBooking(tourBookingId, principal)
  if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as const }
  const payment = booking.payments[0] ?? null
  return {
    ok: true as const,
    booking,
    payment,
    dto: toTourPaymentDto({ booking, payment }),
    tourBooking: toTourBookingDto(booking),
  }
}

export async function initiateMobileTourBookingPayment({
  tourBookingId,
  principal,
  provider,
  locale,
  origin,
}: {
  tourBookingId: string
  principal: MobilePrincipal
  provider: TourPaymentProvider
  locale: 'en' | 'fr'
  origin: string
}) {
  const booking = await ownedTourBooking(tourBookingId, principal)
  if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as const }

  const paid = successfulPayment(booking.payments)
  if (paid || booking.status === 'confirmed' || booking.status === 'active' || booking.status === 'completed') {
    return {
      ok: false as const,
      code: 'PAYMENT_ALREADY_COMPLETED' as const,
      dto: toTourPaymentDto({ booking, payment: paid ?? booking.payments[0] ?? null }),
    }
  }
  if (booking.priceNGN === 0) {
    await prisma.tourBooking.update({
      where: { id: booking.id },
      data: { status: 'confirmed', paymentStatus: 'paid', amountPaidNGN: 0 },
    })
    return {
      ok: true as const,
      booking,
      payment: null,
      dto: toTourPaymentDto({
        booking: { ...booking, status: 'confirmed', paymentStatus: 'paid' },
        payment: null,
      }),
      reused: false,
      zeroPayable: true,
    }
  }
  if (!tourBookingPayable(booking)) {
    return {
      ok: false as const,
      code: 'TOUR_BOOKING_NOT_PAYABLE' as const,
      dto: toTourPaymentDto({ booking, payment: booking.payments[0] ?? null }),
    }
  }
  const currency = assertMobileLaunchCurrency(booking.currencyCode)
  if (!currency.ok) return { ok: false as const, code: currency.code, message: currency.message }

  const existing = activePendingPayment(booking.payments, provider)
  if (existing && existing.expiresAt && existing.expiresAt > new Date()) {
    return {
      ok: true as const,
      booking,
      payment: existing,
      dto: {
        ...toTourPaymentDto({ booking, payment: existing }),
        checkoutConfig:
          provider === 'payonus'
            ? payOnUsTourCheckoutConfig({ origin, locale, booking, payment: existing })
            : null,
      },
      reused: true,
    }
  }

  const reference = `BFYT-P-${booking.id.slice(-6).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`

  if (provider === 'paystack') {
    const configurationError = getPaystackConfigurationError()
    const secret = getPaystackSecret()
    if (configurationError || !secret) {
      return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const, message: configurationError }
    }
    const payment = await prisma.payment.create({
      data: {
        tourBookingId: booking.id,
        amountNGN: booking.priceNGN,
        status: 'pending',
        reference,
        provider: 'paystack',
        currencyCode: MOBILE_LAUNCH_CURRENCY,
        checkoutAmount: booking.priceNGN,
        expiresAt: paymentExpiresAt(),
      },
    })
    try {
      const paystack = await initializePaystackTransaction({
        secret,
        email: booking.user.email || principal.email || `tour-${booking.id}@beninfy.com`,
        amountNGN: booking.priceNGN,
        reference,
        callbackUrl: `${origin}/${locale}/dashboard`,
        metadata: {
          tourBookingId: booking.id,
          paymentId: payment.id,
          provider: 'paystack',
          app: 'customer-mobile',
          product: 'tour',
        },
      })
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerReference: paystack.reference,
          providerCheckoutUrl: paystack.authorizationUrl,
          providerAccessCode: paystack.accessCode,
        },
      })
      return { ok: true as const, booking, payment: updated, dto: toTourPaymentDto({ booking, payment: updated }), reused: false }
    } catch (error) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', failureCode: 'PAYMENT_PROVIDER_UNAVAILABLE' },
      })
      return {
        ok: false as const,
        code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const,
        message: error instanceof Error ? error.message : 'Paystack payment initialization failed',
      }
    }
  }

  const configurationError = getPaymentConfigurationError()
  if (configurationError) {
    return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const, message: configurationError }
  }
  const payment = await prisma.payment.create({
    data: {
      tourBookingId: booking.id,
      amountNGN: booking.priceNGN,
      status: 'pending',
      reference,
      provider: 'payonus',
      currencyCode: MOBILE_LAUNCH_CURRENCY,
      checkoutAmount: booking.priceNGN,
      expiresAt: paymentExpiresAt(),
    },
  })
  return {
    ok: true as const,
    booking,
    payment,
    dto: {
      ...toTourPaymentDto({ booking, payment }),
      checkoutConfig: payOnUsTourCheckoutConfig({ origin, locale, booking, payment }),
    },
    reused: false,
  }
}

export async function verifyMobileTourBookingPayment({
  tourBookingId,
  principal,
  reference,
  providerReference,
}: {
  tourBookingId: string
  principal: MobilePrincipal
  reference?: string | null
  providerReference?: string | null
}) {
  const booking = await ownedTourBooking(tourBookingId, principal)
  if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as const }
  const payment =
    (reference ? booking.payments.find((item) => item.reference === reference) : null) ??
    booking.payments[0] ??
    null
  if (!payment) return { ok: false as const, code: 'PAYMENT_NOT_FOUND' as const }
  if (payment.status === 'paid' || booking.paymentStatus === 'paid') {
    return { ok: true as const, dto: toTourPaymentDto({ booking, payment }) }
  }

  try {
    if (payment.provider === 'paystack') {
      const secret = getPaystackSecret()
      if (getPaystackConfigurationError() || !secret) {
        return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const }
      }
      const verified = await verifyPaystackTransaction(secret, payment.reference)
      await settlePaymentFromPaystack(payment.reference, verified)
    } else if (payment.provider === 'payonus') {
      const onusReference = providerReference || payment.providerReference
      if (!onusReference) return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const }
      const verified = await verifyPayOnUsPayment(onusReference)
      await settlePaymentFromPayOnUs(payment.reference, onusReference, verified)
    } else {
      return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const }
    }
  } catch {
    return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const }
  }

  return getMobileTourBookingPayment({ tourBookingId, principal })
}
