import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import {
  getPaymentConfigurationError,
  getPayOnUsBusinessId,
  getPayOnUsEnvironment,
  normalizePayOnUsPhone,
  type PayOnUsPaymentMethod,
} from '@/lib/payonus'
import {
  getPaystackConfigurationError,
  getPaystackSecret,
  initializePaystackTransaction,
  settlePaymentFromPaystack,
  verifyPaystackTransaction,
} from '@/lib/paystack'
import { settlePaymentFromPayOnUs, verifyPayOnUsPayment } from '@/lib/payonus'

export type MobilePaymentProvider = 'paystack' | 'payonus'
export type MobilePaymentStatus = 'pending' | 'paid' | 'failed' | 'amount_mismatch' | 'ops_review'

export type MobilePaymentErrorCode =
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'PAYMENT_ALREADY_COMPLETED'
  | 'BOOKING_NOT_PAYABLE'
  | 'PAYMENT_PROVIDER_UNAVAILABLE'

type BookingForPayment = {
  id: string
  userId: string | null
  passengerName: string | null
  passengerEmail: string | null
  passengerPhone: string | null
  priceNGN: number
  status: string
  paymentId: string | null
  payments: Array<PaymentForDto>
}

type PaymentForDto = {
  id: string
  bookingId: string
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

export function normalizeMobilePaymentProvider(value: unknown): MobilePaymentProvider {
  return value === 'payonus' ? 'payonus' : 'paystack'
}

export function mobilePaymentState({
  bookingStatus,
  paymentStatus,
}: {
  bookingStatus?: string | null
  paymentStatus?: string | null
}): MobilePaymentStatus {
  if (bookingStatus === 'ops_review') return 'ops_review'
  if (paymentStatus === 'paid') return 'paid'
  if (paymentStatus === 'amount_mismatch') return 'amount_mismatch'
  if (paymentStatus === 'failed') return 'failed'
  return 'pending'
}

export function canRetryPayment({
  bookingStatus,
  paymentStatus,
}: {
  bookingStatus?: string | null
  paymentStatus?: string | null
}) {
  if (
    bookingStatus === 'confirmed' ||
    bookingStatus === 'completed' ||
    bookingStatus === 'ops_review' ||
    bookingStatus === 'cancelled'
  ) {
    return false
  }
  return paymentStatus === 'failed' || paymentStatus === 'amount_mismatch' || !paymentStatus
}

export function bookingPayable(booking: { status: string; priceNGN: number }) {
  return booking.priceNGN > 0 && booking.status === 'pending'
}

export function toMobilePaymentDto({
  booking,
  payment,
}: {
  booking: { id: string; status: string; priceNGN: number }
  payment: PaymentForDto | null
}) {
  const status = mobilePaymentState({
    bookingStatus: booking.status,
    paymentStatus: payment?.status,
  })

  return {
    paymentId: payment?.id ?? null,
    bookingId: booking.id,
    status,
    amount: {
      value: payment?.amountNGN ?? booking.priceNGN,
      currency: payment?.currencyCode ?? 'NGN',
      minorUnit: 'kobo',
      minorValue: (payment?.amountNGN ?? booking.priceNGN) * 100,
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
    canRetry: canRetryPayment({ bookingStatus: booking.status, paymentStatus: payment?.status }),
    failureCode:
      status === 'amount_mismatch'
        ? 'PAYMENT_AMOUNT_MISMATCH'
        : ((payment?.failureCode as MobilePaymentErrorCode | null) ?? null),
    updatedAt: payment?.updatedAt.toISOString() ?? null,
  }
}

export function payOnUsCheckoutConfig({
  origin,
  locale,
  booking,
  payment,
}: {
  origin: string
  locale: 'en' | 'fr'
  booking: BookingForPayment
  payment: PaymentForDto
}) {
  const businessId = getPayOnUsBusinessId()
  if (!businessId) return null
  return {
    businessId,
    amount: booking.priceNGN,
    currency: 'NGN' as const,
    customerEmail: booking.passengerEmail || `booking-${booking.id}@beninfy.com`,
    customerName: booking.passengerName || 'Beninfy Customer',
    customerPhone: normalizePayOnUsPhone(booking.passengerPhone || ''),
    merchantCheckoutReference: payment.reference,
    countryCode: 'NG' as const,
    notificationUrl: `${origin}/api/payments/webhook`,
    redirectUrl: `${origin}/${locale}/rides/confirmed`,
    environment: getPayOnUsEnvironment(),
    paymentMethods: ['card', 'bank', 'palmpay', 'opay'] satisfies PayOnUsPaymentMethod[],
  }
}

async function ownedBooking(bookingId: string, principal: MobilePrincipal) {
  return prisma.booking.findFirst({
    where: { id: bookingId, userId: principal.userId },
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  })
}

function activePendingPayment(payments: PaymentForDto[], provider: MobilePaymentProvider) {
  return (
    payments.find((payment) => payment.provider === provider && payment.status === 'pending') ??
    null
  )
}

function successfulPayment(payments: PaymentForDto[]) {
  return payments.find((payment) => payment.status === 'paid') ?? null
}

function paymentExpiresAt() {
  return new Date(Date.now() + 30 * 60 * 1000)
}

export async function getMobileBookingPayment({
  bookingId,
  principal,
}: {
  bookingId: string
  principal: MobilePrincipal
}) {
  const booking = await ownedBooking(bookingId, principal)
  if (!booking) return { ok: false as const, code: 'BOOKING_NOT_FOUND' as const }
  return {
    ok: true as const,
    booking,
    payment: booking.payments[0] ?? null,
    dto: toMobilePaymentDto({ booking, payment: booking.payments[0] ?? null }),
  }
}

export async function initiateMobileBookingPayment({
  bookingId,
  principal,
  provider,
  locale,
  origin,
}: {
  bookingId: string
  principal: MobilePrincipal
  provider: MobilePaymentProvider
  locale: 'en' | 'fr'
  origin: string
}) {
  const booking = await ownedBooking(bookingId, principal)
  if (!booking) return { ok: false as const, code: 'BOOKING_NOT_FOUND' as const }

  const paid = successfulPayment(booking.payments)
  if (paid || booking.status === 'confirmed' || booking.status === 'completed') {
    return {
      ok: false as const,
      code: 'PAYMENT_ALREADY_COMPLETED' as const,
      dto: toMobilePaymentDto({ booking, payment: paid ?? booking.payments[0] ?? null }),
    }
  }
  if (!bookingPayable(booking)) {
    return {
      ok: false as const,
      code: 'BOOKING_NOT_PAYABLE' as const,
      dto: toMobilePaymentDto({ booking, payment: booking.payments[0] ?? null }),
    }
  }

  const existing = activePendingPayment(booking.payments, provider)
  if (existing && existing.expiresAt && existing.expiresAt > new Date()) {
    return {
      ok: true as const,
      booking,
      payment: existing,
      dto: {
        ...toMobilePaymentDto({ booking, payment: existing }),
        checkoutConfig:
          provider === 'payonus'
            ? payOnUsCheckoutConfig({ origin, locale, booking, payment: existing })
            : null,
      },
      reused: true,
    }
  }

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
    const reference = `BFY-M-${booking.id.slice(-6).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amountNGN: booking.priceNGN,
        status: 'pending',
        reference,
        provider: 'paystack',
        currencyCode: 'NGN',
        checkoutAmount: booking.priceNGN,
        expiresAt: paymentExpiresAt(),
      },
    })
    try {
      const paystack = await initializePaystackTransaction({
        secret,
        email: booking.passengerEmail || principal.email || `booking-${booking.id}@beninfy.com`,
        amountNGN: booking.priceNGN,
        reference,
        callbackUrl: `${origin}/${locale}/rides/confirmed`,
        metadata: {
          bookingId: booking.id,
          paymentId: payment.id,
          provider: 'paystack',
          app: 'customer-mobile',
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
      return {
        ok: true as const,
        booking,
        payment: updated,
        dto: toMobilePaymentDto({ booking, payment: updated }),
        reused: false,
      }
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
    return {
      ok: false as const,
      code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const,
      message: configurationError,
    }
  }
  const reference = `BFY-M-${booking.id.slice(-6).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      amountNGN: booking.priceNGN,
      status: 'pending',
      reference,
      provider: 'payonus',
      currencyCode: 'NGN',
      checkoutAmount: booking.priceNGN,
      expiresAt: paymentExpiresAt(),
    },
  })
  return {
    ok: true as const,
    booking,
    payment,
    dto: {
      ...toMobilePaymentDto({ booking, payment }),
      checkoutConfig: payOnUsCheckoutConfig({ origin, locale, booking, payment }),
    },
    reused: false,
  }
}

export async function verifyMobileBookingPayment({
  bookingId,
  principal,
  reference,
  providerReference,
}: {
  bookingId: string
  principal: MobilePrincipal
  reference?: string | null
  providerReference?: string | null
}) {
  const booking = await ownedBooking(bookingId, principal)
  if (!booking) return { ok: false as const, code: 'BOOKING_NOT_FOUND' as const }
  const payment =
    (reference ? booking.payments.find((item) => item.reference === reference) : null) ??
    booking.payments[0] ??
    null
  if (!payment) return { ok: false as const, code: 'PAYMENT_NOT_FOUND' as const }

  if (
    payment.status === 'paid' ||
    booking.status === 'confirmed' ||
    booking.status === 'completed'
  ) {
    return { ok: true as const, dto: toMobilePaymentDto({ booking, payment }) }
  }

  try {
    if (payment.provider === 'paystack') {
      const secret = getPaystackSecret()
      if (getPaystackConfigurationError() || !secret) {
        return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const }
      }
      const verified = await verifyPaystackTransaction(secret, payment.reference)
      await settlePaymentFromPaystack(payment.reference, verified)
    } else {
      const onusReference = providerReference || payment.providerReference
      if (!onusReference)
        return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const }
      const verified = await verifyPayOnUsPayment(onusReference)
      await settlePaymentFromPayOnUs(payment.reference, onusReference, verified)
    }
  } catch {
    return { ok: false as const, code: 'PAYMENT_PROVIDER_UNAVAILABLE' as const }
  }

  return getMobileBookingPayment({ bookingId, principal })
}
