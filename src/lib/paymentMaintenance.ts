import {
  getPaystackConfigurationError,
  getPaystackSecret,
  settlePaymentFromPaystack,
  verifyPaystackTransaction,
} from '@/lib/paystack'
import {
  getPaymentConfigurationError as getPayOnUsConfigurationError,
  settlePaymentFromPayOnUs,
  verifyPayOnUsPayment,
} from '@/lib/payonus'
import { failBookingPayment } from '@/lib/paymentSettlement'
import { prisma } from '@/lib/prisma'

type RefreshStalePaystackPaymentsOptions = {
  bookingId?: string
  bookingDisplayRef?: string
  paymentReference?: string
  staleMinutes?: number
  take?: number
}

function bookingSuffixFromDisplayRef(ref: string | undefined) {
  const normalized = ref?.trim().toUpperCase()
  if (!normalized?.startsWith('BFY-')) return null

  const suffix = normalized.replace(/^BFY-/, '')
  return suffix && !suffix.includes('-') ? suffix.toLowerCase() : null
}

export async function refreshStalePaystackPayments({
  bookingId,
  bookingDisplayRef,
  paymentReference,
  staleMinutes = 20,
  take = 100,
}: RefreshStalePaystackPaymentsOptions = {}) {
  if (getPaystackConfigurationError()) return { checked: 0, refreshed: 0 }
  const secret = getPaystackSecret()
  if (!secret) return { checked: 0, refreshed: 0 }

  const bookingSuffix = bookingSuffixFromDisplayRef(bookingDisplayRef)
  const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000)
  const payments = await prisma.payment.findMany({
    where: {
      provider: 'paystack',
      status: 'pending',
      ...(paymentReference ? { reference: paymentReference } : {}),
      ...(!paymentReference && !bookingId && !bookingSuffix ? { createdAt: { lt: staleBefore } } : {}),
      ...(bookingId || bookingSuffix
        ? {
            booking: {
              ...(bookingId ? { id: bookingId } : {}),
              ...(bookingSuffix ? { id: { endsWith: bookingSuffix } } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    take,
    select: { reference: true },
  })

  let refreshed = 0
  for (const payment of payments) {
    try {
      const verified = await verifyPaystackTransaction(secret, payment.reference)
      await settlePaymentFromPaystack(payment.reference, verified)
      refreshed += 1
    } catch (error) {
      console.error('Failed to refresh stale Paystack payment', {
        reference: payment.reference,
        error,
      })
    }
  }

  return { checked: payments.length, refreshed }
}

type RefreshStalePayOnUsPaymentsOptions = {
  bookingId?: string
  bookingDisplayRef?: string
  paymentReference?: string
  staleMinutes?: number
  take?: number
}

export async function refreshStalePayOnUsPayments({
  bookingId,
  bookingDisplayRef,
  paymentReference,
  staleMinutes = 20,
  take = 100,
}: RefreshStalePayOnUsPaymentsOptions = {}) {
  if (getPayOnUsConfigurationError()) return { checked: 0, refreshed: 0 }

  const bookingSuffix = bookingSuffixFromDisplayRef(bookingDisplayRef)
  const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000)
  const payments = await prisma.payment.findMany({
    where: {
      provider: 'payonus',
      status: 'pending',
      ...(paymentReference ? { reference: paymentReference } : {}),
      ...(!paymentReference && !bookingId && !bookingSuffix
        ? { createdAt: { lt: staleBefore } }
        : {}),
      ...(bookingId || bookingSuffix
        ? {
            booking: {
              ...(bookingId ? { id: bookingId } : {}),
              ...(bookingSuffix ? { id: { endsWith: bookingSuffix } } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    take,
    select: { id: true, bookingId: true, reference: true, providerReference: true, expiresAt: true },
  })

  let refreshed = 0
  for (const payment of payments) {
    const onusReference = payment.providerReference
    if (!onusReference) {
      if (payment.expiresAt && payment.expiresAt <= new Date()) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'failed', failureCode: 'PAYMENT_EXPIRED' },
        })
        await failBookingPayment(payment.bookingId)
        refreshed += 1
      }
      continue
    }
    try {
      const verified = await verifyPayOnUsPayment(onusReference)
      await settlePaymentFromPayOnUs(payment.reference, onusReference, verified)
      refreshed += 1
    } catch (error) {
      console.error('Failed to refresh stale PayOnUs payment', {
        reference: payment.reference,
        error,
      })
    }
  }

  return { checked: payments.length, refreshed }
}

export async function refreshStalePayments(options: {
  bookingId?: string
  bookingDisplayRef?: string
  paymentReference?: string
  staleMinutes?: number
  take?: number
} = {}) {
  const [paystack, payonus] = await Promise.all([
    refreshStalePaystackPayments(options),
    refreshStalePayOnUsPayments(options),
  ])
  return {
    checked: paystack.checked + payonus.checked,
    refreshed: paystack.refreshed + payonus.refreshed,
    providers: { paystack, payonus },
  }
}
