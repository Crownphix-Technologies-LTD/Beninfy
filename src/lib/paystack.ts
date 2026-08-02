import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'

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
    await prisma.payment.update({ where: { reference }, data: { status: transaction?.status || 'failed' } })
    return { ok: false, status: 'failed', message: transaction?.gateway_response || 'Payment was not successful' }
  }

  const expectedAmount = payment.amountNGN * 100
  if (transaction.amount !== expectedAmount || transaction.currency !== 'NGN') {
    await prisma.payment.update({ where: { reference }, data: { status: 'amount_mismatch' } })
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
    prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: 'confirmed', paymentId: payment.id },
    }),
  ])

  return { ok: true, status: 'paid', bookingId: payment.bookingId, reference, providerReference: transaction.reference }
}
