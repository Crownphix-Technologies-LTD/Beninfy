import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { notifyPaymentIssue, notifyPaymentSuccess } from '@/lib/notifications'
import { failBookingPayment, reserveBookingAfterPayment } from '@/lib/paymentSettlement'

const PAYSTACK_BASE_URL = 'https://api.paystack.co'

type PaystackInitializeResponse = {
  status?: boolean
  message?: string
  data?: {
    authorization_url?: string
    access_code?: string
    reference?: string
  }
}

export type PaystackVerifyResponse = {
  status?: boolean
  message?: string
  data?: {
    status?: string
    reference?: string
    amount?: number
    currency?: string
    paid_at?: string
    channel?: string
    gateway_response?: string
  }
}

export type PaymentSettlement =
  | { ok: true; status: 'paid'; bookingId: string; reference: string; providerReference?: string }
  | { ok: false; status: 'pending' | 'failed' | 'amount_mismatch' | 'not_found'; message: string }

const PAYSTACK_STILL_PENDING_STATUSES = new Set(['ongoing', 'pending', 'processing', 'queued'])

function normalizeUnpaidPaystackStatus(status: string | undefined) {
  const normalized = status?.toLowerCase()
  return normalized && PAYSTACK_STILL_PENDING_STATUSES.has(normalized) ? 'pending' : 'failed'
}

export function paystackEnabled() {
  return process.env.PAYMENTS_ENABLED === 'true'
}

export function getPaystackSecret() {
  return process.env.PAYSTACK_SECRET_KEY?.trim()
}

export function getPaystackPublicKey() {
  return process.env.PAYSTACK_PUBLIC_KEY?.trim()
}

export function getPaystackWebhookAllowedIps() {
  return (process.env.PAYSTACK_WEBHOOK_ALLOWED_IPS ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
}

export function getPaystackConfigurationError() {
  if (!paystackEnabled()) return 'Payments are temporarily unavailable'
  if (!getPaystackSecret()) return 'Paystack secret key is not configured'
  return null
}

export async function initializePaystackTransaction({
  secret,
  email,
  amountNGN,
  reference,
  callbackUrl,
  metadata,
  channels,
}: {
  secret: string
  email: string
  amountNGN: number
  reference: string
  callbackUrl: string
  metadata: Record<string, string>
  channels?: string[]
}) {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountNGN * 100,
      reference,
      currency: 'NGN',
      callback_url: callbackUrl,
      metadata,
      ...(channels?.length ? { channels } : {}),
    }),
  })

  const json = (await res.json().catch(() => ({}))) as PaystackInitializeResponse
  if (!res.ok || !json.status || !json.data?.authorization_url || !json.data?.reference) {
    throw new Error(json.message || 'Payment init failed')
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    reference: json.data.reference,
  }
}

export async function verifyPaystackTransaction(secret: string, reference: string) {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: 'no-store',
  })

  const json = (await res.json().catch(() => ({}))) as PaystackVerifyResponse
  if (!res.ok || !json.status) {
    throw new Error(json.message || 'Payment verification failed')
  }
  return json
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null) {
  const secret = getPaystackSecret()
  if (!secret || !signature) return false

  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function verifyPaystackWebhookIp(requestIp: string) {
  const allowedIps = getPaystackWebhookAllowedIps()
  if (allowedIps.length === 0) return true
  return allowedIps.includes(requestIp)
}

export async function settlePaymentFromPaystack(reference: string, verified: PaystackVerifyResponse): Promise<PaymentSettlement> {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { booking: true },
  })

  if (!payment) {
    return { ok: false, status: 'not_found', message: 'Payment record not found' }
  }

  const transaction = verified.data
  if (transaction?.status !== 'success') {
    const nextStatus = normalizeUnpaidPaystackStatus(transaction?.status)
    await prisma.payment.update({ where: { reference }, data: { status: nextStatus } })
    if (nextStatus === 'failed') {
      await failBookingPayment(payment.bookingId)
    }
    if (payment.status !== nextStatus && nextStatus === 'failed') {
      await notifyPaymentIssue({
        bookingId: payment.bookingId,
        reference,
        provider: 'paystack',
        status: transaction?.status || 'failed',
        message: transaction?.gateway_response || 'Payment was not successful',
      })
    }
    return { ok: false, status: nextStatus, message: transaction?.gateway_response || 'Payment was not successful' }
  }

  const expectedAmount = payment.amountNGN * 100
  if (transaction.amount !== expectedAmount || transaction.currency !== 'NGN') {
    await prisma.payment.update({ where: { reference }, data: { status: 'amount_mismatch' } })
    await failBookingPayment(payment.bookingId)
    if (payment.status !== 'amount_mismatch') {
      await notifyPaymentIssue({
        bookingId: payment.bookingId,
        reference,
        provider: 'paystack',
        status: 'amount_mismatch',
        message: 'Payment amount does not match booking total',
      })
    }
    return { ok: false, status: 'amount_mismatch', message: 'Payment amount does not match booking total' }
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { reference },
      data: {
        status: 'paid',
        provider: 'paystack',
        providerReference: transaction.reference ?? payment.providerReference,
        currencyCode: 'NGN',
        checkoutAmount: payment.amountNGN,
      },
    }),
    reserveBookingAfterPayment(payment.bookingId, payment.id),
  ])

  if (payment.status !== 'paid') {
    await notifyPaymentSuccess(payment.bookingId, payment.id)
  }

  return { ok: true, status: 'paid', bookingId: payment.bookingId, reference, providerReference: transaction.reference }
}
