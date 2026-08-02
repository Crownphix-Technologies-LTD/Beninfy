import { createHash, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { reserveBookingAfterPayment } from '@/lib/paymentSettlement'

type PayOnUsEnvironment = 'test' | 'production'

export type PayOnUsPaymentMethod = 'card' | 'bank' | 'palmpay' | 'opay'

export type PayOnUsCheckoutConfig = {
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
  environment: PayOnUsEnvironment
  paymentMethods: PayOnUsPaymentMethod[]
}

type PayOnUsTokenResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  message?: string
}

export type PayOnUsPaymentStatusResponse = {
  status?: number
  message?: string
  data?: {
    amount?: number
    amountPaid?: number
    currency?: string
    onusReference?: string
    reference?: string
    merchantReference?: string | null
    merchantCheckoutReference?: string | null
    paymentStatus?: string
    paymentChannel?: string
  }
}

export type PayOnUsWebhookPayload = {
  type?: string
  currency?: string
  businessId?: string
  accountNumber?: string
  onusReference?: string
  paymentStatus?: string
  paymentChannel?: string
  merchantReference?: string
  providerReference?: string
  transactionAmount?: number | string
  merchantCheckoutReference?: string | null
}

export type PaymentSettlement =
  | { ok: true; status: 'paid'; bookingId: string; reference: string; providerReference?: string }
  | { ok: false; status: 'pending' | 'failed' | 'amount_mismatch' | 'not_found'; message: string }

const tokenCache = globalThis as typeof globalThis & {
  __payonusToken?: { token: string; expiresAt: number }
}

export function paymentsEnabled() {
  return process.env.PAYMENTS_ENABLED === 'true'
}

export function getPayOnUsClientId() {
  return process.env.PAYONUS_CLIENT_ID?.trim()
}

export function getPayOnUsClientSecret() {
  return process.env.PAYONUS_CLIENT_SECRET?.trim()
}

export function getPayOnUsBusinessId() {
  return process.env.PAYONUS_BUSINESS_ID?.trim()
}

export function getPayOnUsWebhookKey() {
  return process.env.PAYONUS_WEBHOOK_KEY?.trim()
}

export function getPayOnUsEnvironment(): PayOnUsEnvironment {
  return process.env.PAYONUS_ENVIRONMENT?.toLowerCase() === 'production' ? 'production' : 'test'
}

export function getPayOnUsBaseUrl() {
  return getPayOnUsEnvironment() === 'production' ? 'https://core.payonus.com' : 'https://core-sandbox.payonus.com'
}

export function getPaymentConfigurationError() {
  if (!paymentsEnabled()) return 'Payments are temporarily unavailable'
  if (!getPayOnUsClientId() || !getPayOnUsClientSecret() || !getPayOnUsBusinessId() || !getPayOnUsWebhookKey()) {
    return 'PayOnUs payments are not fully configured'
  }
  return null
}

export function normalizePayOnUsPhone(phone: string) {
  const trimmed = phone.trim()
  if (!trimmed) return '+2347000000000'
  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '')

  const digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('234')) return `+${digits}`
  return `+234${digits.replace(/^0+/, '')}`
}

export async function getPayOnUsAccessToken() {
  const cached = tokenCache.__payonusToken
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const apiClientId = getPayOnUsClientId()
  const apiClientSecret = getPayOnUsClientSecret()
  if (!apiClientId || !apiClientSecret) throw new Error('PayOnUs API credentials are not configured')

  const res = await fetch(`${getPayOnUsBaseUrl()}/api/v1/access-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ apiClientId, apiClientSecret }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as PayOnUsTokenResponse
  if (!res.ok || !json.access_token) {
    throw new Error(json.message || 'Could not authenticate with PayOnUs')
  }

  tokenCache.__payonusToken = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000,
  }
  return json.access_token
}

export async function verifyPayOnUsPayment(onusReference: string) {
  if (!paymentsEnabled()) throw new Error('Payments are temporarily unavailable')

  const businessId = getPayOnUsBusinessId()
  if (!businessId) throw new Error('PayOnUs business ID is not configured')

  const token = await getPayOnUsAccessToken()
  const url = new URL(`${getPayOnUsBaseUrl()}/api/v1/payment-requests/businesses/${businessId}`)
  url.searchParams.set('onusReference', onusReference)

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as PayOnUsPaymentStatusResponse
  if (!res.ok || (json.status && json.status >= 400)) {
    throw new Error(json.message || 'PayOnUs payment verification failed')
  }
  return json
}

function successful(status: string | undefined) {
  return status?.toUpperCase() === 'SUCCESSFUL'
}

async function findPayment(reference?: string | null, providerReference?: string | null) {
  if (reference) {
    const payment = await prisma.payment.findUnique({ where: { reference }, include: { booking: true } })
    if (payment) return payment
  }
  if (providerReference) {
    return prisma.payment.findUnique({ where: { providerReference }, include: { booking: true } })
  }
  return null
}

export async function settlePaymentFromPayOnUs(
  reference: string,
  onusReference: string,
  verified: PayOnUsPaymentStatusResponse
): Promise<PaymentSettlement> {
  const payment = await findPayment(reference, onusReference)
  if (!payment) return { ok: false, status: 'not_found', message: 'Payment record not found' }

  const data = verified.data
  if (!successful(data?.paymentStatus)) {
    const nextStatus = data?.paymentStatus?.toUpperCase() === 'FAILED' ? 'failed' : 'pending'
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: nextStatus, providerReference: data?.onusReference ?? onusReference },
    })
    return { ok: false, status: nextStatus, message: verified.message || 'Payment is not complete yet' }
  }

  const paidAmount = Number(data?.amountPaid ?? data?.amount ?? 0)
  const currency = data?.currency ?? 'NGN'
  if (paidAmount + 0.01 < payment.amountNGN || currency !== 'NGN') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'amount_mismatch', providerReference: data?.onusReference ?? onusReference },
    })
    return { ok: false, status: 'amount_mismatch', message: 'Payment amount does not match booking total' }
  }

  const providerReference = data?.onusReference ?? onusReference
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'paid', provider: 'payonus', providerReference, currencyCode: 'NGN', checkoutAmount: payment.amountNGN },
    }),
    reserveBookingAfterPayment(payment.bookingId, payment.id),
  ])

  return { ok: true, status: 'paid', bookingId: payment.bookingId, reference: payment.reference, providerReference }
}

export function verifyPayOnUsWebhookHash(payload: PayOnUsWebhookPayload, hash: string) {
  const verificationKey = getPayOnUsWebhookKey()
  if (!verificationKey) return false

  const verificationString = `${payload.accountNumber ?? ''}${payload.onusReference ?? ''}${payload.paymentStatus ?? ''}${verificationKey}`
  const expected = createHash('sha256').update(verificationString).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(hash, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function settlePaymentFromPayOnUsWebhook(payload: PayOnUsWebhookPayload): Promise<PaymentSettlement | null> {
  const reference = payload.merchantCheckoutReference || payload.merchantReference
  const onusReference = payload.onusReference
  if (!reference && !onusReference) return null

  const payment = await findPayment(reference, onusReference)
  if (!payment) return { ok: false, status: 'not_found', message: 'Payment record not found' }

  if (!successful(payload.paymentStatus)) {
    const nextStatus = payload.paymentStatus?.toUpperCase() === 'FAILED' ? 'failed' : 'pending'
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: nextStatus, providerReference: onusReference ?? payment.providerReference },
    })
    return { ok: false, status: nextStatus, message: 'Payment is not complete yet' }
  }

  const paidAmount = Number(payload.transactionAmount ?? 0)
  if (paidAmount + 0.01 < payment.amountNGN || payload.currency !== 'NGN') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'amount_mismatch', providerReference: onusReference ?? payment.providerReference },
    })
    return { ok: false, status: 'amount_mismatch', message: 'Payment amount does not match booking total' }
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'paid',
        provider: 'payonus',
        providerReference: onusReference ?? payment.providerReference,
        currencyCode: 'NGN',
        checkoutAmount: payment.amountNGN,
      },
    }),
    reserveBookingAfterPayment(payment.bookingId, payment.id),
  ])

  return { ok: true, status: 'paid', bookingId: payment.bookingId, reference: payment.reference, providerReference: onusReference }
}
