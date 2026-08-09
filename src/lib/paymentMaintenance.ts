import {
  getPaystackConfigurationError,
  getPaystackSecret,
  settlePaymentFromPaystack,
  verifyPaystackTransaction,
} from '@/lib/paystack'
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
