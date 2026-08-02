import { NextResponse } from 'next/server'
import {
  paymentsEnabled,
  settlePaymentFromPayOnUsWebhook,
  verifyPayOnUsWebhookHash,
  type PayOnUsWebhookPayload,
} from '@/lib/payonus'
import {
  settlePaymentFromPaystack,
  verifyPaystackWebhookIp,
  verifyPaystackWebhookSignature,
  type PaystackVerifyResponse,
} from '@/lib/paystack'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

type PaystackWebhookPayload = {
  event?: string
  data?: PaystackVerifyResponse['data']
}

export async function POST(req: Request) {
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rateLimit = await checkRateLimit({
    scope: 'payment-webhook',
    identifier: requestIp(req),
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0)
  if (contentLength > 64 * 1024) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const raw = await req.text()
  if (raw.length > 64 * 1024) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const paystackSignature = req.headers.get('x-paystack-signature')
  if (paystackSignature) {
    if (!verifyPaystackWebhookIp(requestIp(req))) {
      return NextResponse.json({ error: 'IP not allowed' }, { status: 403 })
    }

    if (!verifyPaystackWebhookSignature(raw, paystackSignature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let event: PaystackWebhookPayload
    try {
      event = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
    }

    if (event.event === 'charge.success' && event.data?.reference) {
      await settlePaymentFromPaystack(event.data.reference, { status: true, data: event.data })
    }

    return NextResponse.json({ ok: true })
  }

  let event: PayOnUsWebhookPayload
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  const hash = req.headers.get('hash') ?? ''
  if (!verifyPayOnUsWebhookHash(event, hash)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  await settlePaymentFromPayOnUsWebhook(event)

  return NextResponse.json({ ok: true })
}
