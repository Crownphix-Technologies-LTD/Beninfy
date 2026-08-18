import { prisma } from '@/lib/prisma'

const PAYAZA_BASE_URL = 'https://api.payaza.africa/live'

export type PayazaCurrency = 'NGN' | 'XOF'

export type PaymentSettlement =
  | { ok: true; status: 'paid'; bookingId: string; reference: string }
  | { ok: false; status: 'pending' | 'failed' | 'amount_mismatch' | 'not_found'; message: string }

export type PayazaCheckoutConfig = {
  merchant_key: string
  connection_mode: 'Live' | 'Test'
  checkout_amount: number
  currency_code: PayazaCurrency
  email_address: string
  first_name: string
  last_name: string
  phone_number: string
  transaction_reference: string
  country_code?: 'BEN'
  biller_name?: string
  virtual_account_configuration?: { expires_in_minutes: number }
  additional_details?: Record<string, string>
}

type PayazaStatusResponse = {
  success?: boolean
  message?: string
  data?: {
    amount_received?: number
    transaction_status?: string
    currency?: string
    merchant_transaction_reference?: string
    status_reason?: string
  }
}

export function getPayazaPublicKey() {
  return process.env.PAYAZA_PUBLIC_KEY?.trim()
}

export function getPayazaApiKey() {
  return process.env.PAYAZA_API_KEY?.trim()
}

export function getPayazaWebhookSecret() {
  return process.env.PAYAZA_WEBHOOK_SECRET?.trim()
}

export function paymentsEnabled() {
  return process.env.PAYMENTS_ENABLED === 'true' && process.env.ENABLE_LEGACY_PAYAZA === 'true'
}

export function getPaymentConfigurationError() {
  if (!paymentsEnabled()) return 'Payaza is disabled for the NGN-only launch payment path'
  if (!getPayazaPublicKey() || !getPayazaApiKey() || !getPayazaWebhookSecret()) {
    return 'Payments are not fully configured'
  }
  return null
}

export function getPayazaConnectionMode(): 'Live' | 'Test' {
  return process.env.PAYAZA_CONNECTION_MODE?.toLowerCase() === 'live' ? 'Live' : 'Test'
}

export function getPayazaTenantId(): 'live' | 'test' {
  return getPayazaConnectionMode() === 'Live' ? 'live' : 'test'
}

export function getNgnToXofRate() {
  const raw = process.env.PAYAZA_NGN_TO_XOF_RATE || process.env.NEXT_PUBLIC_NGN_TO_XOF_RATE
  const rate = Number(raw)
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

export function convertBookingAmount(amountNGN: number, currency: PayazaCurrency) {
  if (currency === 'NGN') return amountNGN

  const rate = getNgnToXofRate()
  if (!rate) {
    throw new Error('CFA payment is not configured. Set PAYAZA_NGN_TO_XOF_RATE.')
  }
  return Math.round(amountNGN * rate)
}

export function splitCustomerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Beninfy', lastName: 'Customer' }
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Customer' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function normalizePayazaPhone(phone: string, currency: PayazaCurrency) {
  const trimmed = phone.trim()
  if (!trimmed) return currency === 'XOF' ? '+2290100000000' : '+2347000000000'

  if (trimmed.startsWith('+')) return trimmed.replace(/[^\d+]/g, '')

  const digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('229') || digits.startsWith('234')) return `+${digits}`
  if (currency === 'XOF') return `+229${digits.replace(/^0+/, '')}`
  return `+234${digits.replace(/^0+/, '')}`
}

export function payazaAuthorizationHeader(apiKey: string) {
  return `Payaza ${Buffer.from(apiKey).toString('base64')}`
}

export async function verifyPayazaTransaction(reference: string) {
  if (!paymentsEnabled()) throw new Error('Payments are temporarily unavailable')

  const apiKey = getPayazaApiKey()
  if (!apiKey) throw new Error('Payaza API key is not configured')

  const url = new URL(`${PAYAZA_BASE_URL}/merchant-collection/transfer_notification_controller/merchant/transaction-query`)
  url.searchParams.set('merchant_reference', reference)

  const res = await fetch(url, {
    headers: {
      Authorization: payazaAuthorizationHeader(apiKey),
      'X-TenantID': getPayazaTenantId(),
    },
    cache: 'no-store',
  })

  const json = (await res.json().catch(() => ({}))) as PayazaStatusResponse
  if (!res.ok || json.success === false) {
    throw new Error(json.message || 'Payaza payment verification failed')
  }
  return json
}

export async function settlePaymentFromPayaza(
  reference: string,
  verified: PayazaStatusResponse,
  expectedCurrency?: PayazaCurrency
): Promise<PaymentSettlement> {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { booking: true },
  })

  if (!payment) {
    return { ok: false, status: 'not_found', message: 'Payment record not found' }
  }

  const data = verified.data
  const status = data?.transaction_status?.toLowerCase()
  if (status !== 'completed' && status !== 'funds received') {
    const nextStatus = status === 'failed' ? 'failed' : 'pending'
    await prisma.payment.update({ where: { reference }, data: { status: nextStatus } })
    return { ok: false, status: nextStatus, message: data?.status_reason || 'Payment is not complete yet' }
  }

  const currency = (expectedCurrency || data?.currency || 'NGN') as PayazaCurrency
  const expectedAmount = convertBookingAmount(payment.amountNGN, currency)
  const paidAmount = Number(data?.amount_received ?? 0)
  if (paidAmount + 0.01 < expectedAmount || (data?.currency && data.currency !== currency)) {
    await prisma.payment.update({ where: { reference }, data: { status: 'amount_mismatch' } })
    return { ok: false, status: 'amount_mismatch', message: 'Payment amount does not match booking total' }
  }

  await prisma.$transaction([
    prisma.payment.update({ where: { reference }, data: { status: 'paid' } }),
    prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: 'confirmed', paymentId: payment.id },
    }),
  ])

  return { ok: true, status: 'paid', bookingId: payment.bookingId, reference }
}

export async function settlePaymentFromPayazaWebhook(payload: {
  merchant_reference?: string
  transaction_reference?: string
  status?: string
  transaction_status?: string
  amount_received?: number | string
  request_amount?: number | string
  currency_code?: string
}) {
  const reference = payload.merchant_reference || payload.transaction_reference
  if (!reference) return null

  const amount = Number(payload.amount_received ?? payload.request_amount ?? 0)
  return settlePaymentFromPayaza(reference, {
    success: true,
    data: {
      amount_received: amount,
      transaction_status: payload.status || payload.transaction_status,
      currency: payload.currency_code,
      merchant_transaction_reference: reference,
    },
  }, payload.currency_code as PayazaCurrency | undefined)
}
