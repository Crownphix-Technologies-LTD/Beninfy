import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { isAdminRole } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import {
  getPaymentConfigurationError,
  getPayOnUsBusinessId,
  getPayOnUsEnvironment,
  normalizePayOnUsPhone,
  paymentsEnabled,
} from '@/lib/payonus'
import {
  getPaystackConfigurationError,
  getPaystackSecret,
  initializePaystackTransaction,
} from '@/lib/paystack'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const initSchema = z.object({
  bookingId: z.string().min(1),
  locale: z.enum(['en', 'fr']).default('en'),
  passengerName: z.string().trim().max(100).optional(),
  passengerEmail: z.string().trim().email().optional().or(z.literal('')),
  passengerPhone: z.string().trim().max(40).optional(),
  currencyCode: z.literal('NGN').default('NGN'),
  provider: z.enum(['paystack', 'payonus']).default('paystack'),
})

export async function POST(req: Request) {
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: 'Payments are temporarily unavailable' }, { status: 503 })
  }

  const session = (await auth()) as Session | null
  const sessionRole = (session?.user as { role?: string } | undefined)?.role
  if (isAdminRole(sessionRole)) {
    return NextResponse.json({ error: 'Use the backoffice for admin accounts' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = initSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const provider = parsed.data.provider

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { user: { select: { role: true } } },
  })
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }
  if (!session?.user?.id && isAdminRole(booking.user?.role)) {
    return NextResponse.json({ error: 'Use a customer email address for booking checkout' }, { status: 403 })
  }
  const requestEmail = (parsed.data.passengerEmail ?? '').trim().toLowerCase()
  const bookingEmail = (booking.passengerEmail ?? '').trim().toLowerCase()
  const sessionOwnsBooking = Boolean(session?.user?.id && booking.userId === session.user.id)
  const emailOwnsBooking = Boolean(requestEmail && bookingEmail && requestEmail === bookingEmail)
  if (!sessionOwnsBooking && !emailOwnsBooking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const rateLimit = await checkRateLimit({
    scope: 'payment-initiate',
    identifier: `${booking.id}:${bookingEmail || requestEmail}:${requestIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many payment attempts' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  const reference = `BFY-${booking.id.slice(-6).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`
  const email = requestEmail || bookingEmail || `booking-${booking.id}@beninfy.com`
  const origin = new URL(req.url).origin
  const customerName = parsed.data.passengerName || booking.passengerName || session?.user?.name || 'Beninfy Customer'

  if (provider === 'paystack') {
    const configurationError = getPaystackConfigurationError()
    if (configurationError) {
      return NextResponse.json({ error: configurationError }, { status: 503 })
    }

    const secret = getPaystackSecret()
    if (!secret) return NextResponse.json({ error: 'Paystack secret key is not configured' }, { status: 503 })

    const payment = await prisma.payment.upsert({
      where: { reference },
      update: {
        bookingId: booking.id,
        amountNGN: booking.priceNGN,
        status: 'pending',
        provider: 'paystack',
        providerReference: null,
        currencyCode: 'NGN',
        checkoutAmount: booking.priceNGN,
      },
      create: {
        bookingId: booking.id,
        amountNGN: booking.priceNGN,
        status: 'pending',
        reference,
        provider: 'paystack',
        currencyCode: 'NGN',
        checkoutAmount: booking.priceNGN,
      },
    })

    let paystack: Awaited<ReturnType<typeof initializePaystackTransaction>>
    try {
      paystack = await initializePaystackTransaction({
        secret,
        email,
        amountNGN: booking.priceNGN,
        reference,
        callbackUrl: `${origin}/${parsed.data.locale}/rides/confirmed`,
        metadata: {
          bookingId: booking.id,
          paymentId: payment.id,
          provider: 'paystack',
          customerName,
        },
      })
    } catch (err) {
      await prisma.payment.update({ where: { reference }, data: { status: 'failed' } })
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Paystack payment initialization failed' },
        { status: 502 }
      )
    }

    await prisma.payment.update({
      where: { reference },
      data: { providerReference: paystack.reference },
    })

    return NextResponse.json({
      mode: 'paystack_redirect',
      provider: 'paystack',
      reference,
      bookingId: booking.id,
      authorizationUrl: paystack.authorizationUrl,
      accessCode: paystack.accessCode,
    })
  }

  const configurationError = getPaymentConfigurationError()
  if (configurationError) {
    return NextResponse.json({ error: configurationError }, { status: 503 })
  }

  const businessId = getPayOnUsBusinessId()
  if (!businessId) return NextResponse.json({ error: 'PayOnUs business ID is not configured' }, { status: 503 })

  await prisma.payment.upsert({
    where: { reference },
    update: {
      bookingId: booking.id,
      amountNGN: booking.priceNGN,
      status: 'pending',
      provider: 'payonus',
      currencyCode: 'NGN',
      checkoutAmount: booking.priceNGN,
    },
    create: {
      bookingId: booking.id,
      amountNGN: booking.priceNGN,
      status: 'pending',
      reference,
      provider: 'payonus',
      currencyCode: 'NGN',
      checkoutAmount: booking.priceNGN,
    },
  })

  return NextResponse.json({
    mode: 'payonus_checkout',
    provider: 'payonus',
    reference,
    bookingId: booking.id,
    checkout: {
      businessId,
      amount: booking.priceNGN,
      currency: 'NGN',
      customerEmail: email,
      customerName,
      customerPhone: normalizePayOnUsPhone(parsed.data.passengerPhone || booking.passengerPhone || ''),
      merchantCheckoutReference: reference,
      countryCode: 'NG',
      notificationUrl: `${origin}/api/payments/webhook`,
      redirectUrl: `${origin}/${parsed.data.locale}/rides/confirmed`,
      environment: getPayOnUsEnvironment(),
      paymentMethods: ['card', 'bank', 'palmpay', 'opay'],
    },
  })
}
