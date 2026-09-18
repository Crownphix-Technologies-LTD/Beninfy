import { randomBytes } from 'crypto'
import type { Prisma } from '@prisma/client'
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
import {
  freezeTourCoupon,
  redeemTourCoupon,
  tourPricingDto,
  expireFailedTourCoupon,
} from '@/lib/mobile/tourCoupons'

export type TourPaymentProvider = MobileLaunchPaymentProvider

type TourPaymentForDto = {
  tourPricingSnapshot?: Prisma.JsonValue | null
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
  return (
    payments.find((payment) => payment.provider === provider && payment.status === 'pending') ??
    null
  )
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

export function tourBookingPayable(booking: {
  status: string
  paymentStatus: string
  priceNGN: number
}) {
  return (
    booking.priceNGN > 0 &&
    booking.status === 'payment_pending' &&
    ['pending', 'failed'].includes(booking.paymentStatus)
  )
}

export function tourCouponsSupported() {
  return true
}

export function normalizeTourPaymentProvider(value: unknown): TourPaymentProvider {
  return normalizeMobileLaunchPaymentProvider(value)
}

export function toTourPaymentDto({
  booking,
  payment,
}: {
  booking: {
    id: string
    reference: string
    status: string
    paymentStatus: string
    priceNGN: number
    subtotalNGN?: number | null
    discountNGN?: number
    couponSnapshot?: Prisma.JsonValue | null
    commercialSnapshot?: Prisma.JsonValue | null
  }
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
    pricing:
      payment?.tourPricingSnapshot ??
      tourPricingDto({
        priceNGN: booking.priceNGN,
        subtotalNGN: booking.subtotalNGN ?? null,
        discountNGN: booking.discountNGN ?? 0,
        couponSnapshot: booking.couponSnapshot ?? null,
        commercialSnapshot: booking.commercialSnapshot ?? null,
      }),
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

async function ownedTourBooking(
  tourBookingId: string,
  principal: MobilePrincipal,
  client = prisma
) {
  return client.tourBooking.findFirst({
    where: { id: tourBookingId, userId: principal.userId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      days: {
        orderBy: { dayNumber: 'asc' },
        include: { stops: { orderBy: { sortOrder: 'asc' } } },
      },
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

export async function initiateMobileTourBookingPayment(
  {
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
  },
  client = prisma
) {
  const booking = await ownedTourBooking(tourBookingId, principal, client)
  if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as const }

  const paid = successfulPayment(booking.payments)
  if (booking.quoteStatus === 'pending' || booking.status === 'quote_pending')
    return { ok: false as const, code: 'TOUR_QUOTE_REQUIRED' as const }
  if (
    paid ||
    booking.status === 'confirmed' ||
    booking.status === 'active' ||
    booking.status === 'completed'
  ) {
    return {
      ok: false as const,
      code: 'PAYMENT_ALREADY_COMPLETED' as const,
      dto: toTourPaymentDto({ booking, payment: paid ?? booking.payments[0] ?? null }),
    }
  }
  const currency = assertMobileLaunchCurrency(booking.currencyCode)
  if (!currency.ok) return { ok: false as const, code: currency.code, message: currency.message }
  if (booking.priceNGN === 0) {
    if (booking.status !== 'payment_pending' || !['pending', 'failed'].includes(booking.paymentStatus))
      return { ok: false as const, code: 'TOUR_BOOKING_NOT_PAYABLE' as const }
    const settled = await client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TourBooking" WHERE "id" = ${booking.id} FOR UPDATE`
      const current = await tx.tourBooking.findUniqueOrThrow({ where: { id: booking.id } })
      if (current.priceNGN !== 0 || current.status !== 'payment_pending')
        return { ok: false as const, code: 'TOUR_PRICING_LOCKED' as const }
      const frozen = await freezeTourCoupon(current, tx)
      if (!frozen.ok) return frozen
      await redeemTourCoupon(current.id, tx)
      await tx.tourBooking.update({
        where: { id: current.id },
        data: { status: 'confirmed', paymentStatus: 'paid', amountPaidNGN: 0 },
      })
      return { ok: true as const }
    })
    if (!settled.ok) return settled
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

  const existing = activePendingPayment(booking.payments, provider)
  if (existing && existing.expiresAt && existing.expiresAt > new Date()) {
    if (provider === 'paystack' && !existing.providerAccessCode)
      return { ok: false as const, code: 'TOUR_PRICING_LOCKED' as const }
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

  const configurationError =
    provider === 'paystack' ? getPaystackConfigurationError() : getPaymentConfigurationError()
  if (configurationError)
    return {
      ok: false as const,
      code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const,
      message: configurationError,
    }
  const prepared = await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TourBooking" WHERE "id" = ${booking.id} FOR UPDATE`
    const current = await ownedTourBooking(booking.id, principal, tx as typeof prisma)
    if (!current || !tourBookingPayable(current))
      return { ok: false as const, code: 'TOUR_BOOKING_NOT_PAYABLE' as const }
    const pending = current.payments.find((p) => p.status === 'pending')
    if (pending) {
      if (pending.provider !== provider)
        return { ok: false as const, code: 'TOUR_PRICING_LOCKED' as const }
      if (
        (provider === 'paystack' && !pending.providerAccessCode) ||
        (pending.expiresAt && pending.expiresAt <= new Date())
      )
        return { ok: false as const, code: 'TOUR_PRICING_LOCKED' as const }
      return { ok: true as const, booking: current, payment: pending, reused: true }
    }
    const frozen = await freezeTourCoupon(current, tx)
    if (!frozen.ok) return frozen
    await tx.tourBooking.update({ where: { id: current.id }, data: { paymentStatus: 'pending' } })
    const payment = await tx.payment.create({
      data: {
        tourBookingId: current.id,
        amountNGN: current.priceNGN,
        status: 'pending',
        reference,
        provider,
        currencyCode: MOBILE_LAUNCH_CURRENCY,
        checkoutAmount: current.priceNGN,
        expiresAt: paymentExpiresAt(),
        tourPricingSnapshot: tourPricingDto(current),
      },
    })
    return { ok: true as const, booking: current, payment, reused: false }
  })
  if (!prepared.ok) return prepared
  if (prepared.reused)
    return {
      ok: true as const,
      booking: prepared.booking,
      payment: prepared.payment,
      reused: true,
      dto: {
        ...toTourPaymentDto(prepared),
        checkoutConfig:
          provider === 'payonus'
            ? payOnUsTourCheckoutConfig({ origin, locale, ...prepared })
            : null,
      },
    }
  const checkoutBooking = prepared.booking
  const payment = prepared.payment

  if (provider === 'paystack') {
    const configurationError = getPaystackConfigurationError()
    const secret = getPaystackSecret()
    if (configurationError || !secret) {
      return {
        ok: false as const,
        code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const,
        message: configurationError,
      }
    }
    try {
      const paystack = await initializePaystackTransaction({
        secret,
        email: booking.user.email || principal.email || `tour-${booking.id}@beninfy.com`,
        amountNGN: payment.amountNGN,
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
      const updated = await client.payment.update({
        where: { id: payment.id },
        data: {
          providerReference: paystack.reference,
          providerCheckoutUrl: paystack.authorizationUrl,
          providerAccessCode: paystack.accessCode,
        },
      })
      return {
        ok: true as const,
        booking: checkoutBooking,
        payment: updated,
        dto: toTourPaymentDto({ booking: checkoutBooking, payment: updated }),
        reused: false,
      }
    } catch (error) {
      await client.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', failureCode: 'PAYMENT_PROVIDER_UNAVAILABLE' },
      })
      await expireFailedTourCoupon(booking.id, client)
      return {
        ok: false as const,
        code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const,
        message: error instanceof Error ? error.message : 'Paystack payment initialization failed',
      }
    }
  }

  return {
    ok: true as const,
    booking: checkoutBooking,
    payment,
    dto: {
      ...toTourPaymentDto({ booking: checkoutBooking, payment }),
      checkoutConfig: payOnUsTourCheckoutConfig({
        origin,
        locale,
        booking: checkoutBooking,
        payment,
      }),
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
      if (!onusReference)
        return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const }
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
