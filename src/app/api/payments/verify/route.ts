import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCustomer } from '@/lib/customer'
import { prisma } from '@/lib/prisma'
import {
  settlePaymentFromPayOnUs,
  verifyPayOnUsPayment,
} from '@/lib/payonus'
import {
  getPaystackConfigurationError,
  getPaystackSecret,
  settlePaymentFromPaystack,
  verifyPaystackTransaction,
} from '@/lib/paystack'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const verifySchema = z.object({
  reference: z.string().trim().min(1).max(100),
  providerReference: z.string().trim().min(1).max(160).optional(),
})

async function verify(req: Request, reference: string, providerReference?: string) {
  const customer = await requireCustomer()
  if (!customer.ok) return customer.response
  const { session } = customer
  const user = session.user!
  const rateLimit = await checkRateLimit({
    scope: 'payment-verify',
    identifier: `${user.id}:${requestIp(req)}`,
    limit: 30,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many verification attempts' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { booking: { select: { userId: true } } },
  })
  if (!payment || payment.booking.userId !== user.id) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  if (payment.provider === 'paystack') {
    const configurationError = getPaystackConfigurationError()
    if (configurationError) {
      return NextResponse.json({ error: configurationError }, { status: 503 })
    }

    const secret = getPaystackSecret()
    if (!secret) return NextResponse.json({ error: 'Paystack secret key is not configured' }, { status: 503 })

    try {
      const verified = await verifyPaystackTransaction(secret, reference)
      const settlement = await settlePaymentFromPaystack(reference, verified)
      return NextResponse.json({ payment: settlement, transaction: verified.data })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Payment verification failed' },
        { status: 502 }
      )
    }
  }

  const onusReference = providerReference || payment.providerReference
  if (!onusReference) {
    return NextResponse.json({ error: 'PayOnUs reference is required' }, { status: 400 })
  }

  try {
    const verified = await verifyPayOnUsPayment(onusReference)
    const settlement = await settlePaymentFromPayOnUs(reference, onusReference, verified)
    return NextResponse.json({ payment: settlement, transaction: verified.data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Payment verification failed' },
      { status: 502 }
    )
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = verifySchema.safeParse({
    reference: url.searchParams.get('reference'),
    providerReference: url.searchParams.get('providerReference') || undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
  }
  return verify(req, parsed.data.reference, parsed.data.providerReference)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
  }
  return verify(req, parsed.data.reference, parsed.data.providerReference)
}
