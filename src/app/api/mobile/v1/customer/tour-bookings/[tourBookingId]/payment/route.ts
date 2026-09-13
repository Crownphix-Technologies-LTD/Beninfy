import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import {
  getMobileTourBookingPayment,
  initiateMobileTourBookingPayment,
  normalizeTourPaymentProvider,
} from '@/lib/mobile/tourPayments'
import { assertMobileLaunchCurrency } from '@/lib/mobile/paymentPolicy'

export const runtime = 'nodejs'
type TourPaymentContext = RouteContext<'/api/mobile/v1/customer/tour-bookings/[tourBookingId]/payment'>

const initSchema = z.object({
  provider: z.enum(['paystack', 'payonus']).default('paystack'),
  currency: z.string().trim().optional().default('NGN'),
  locale: z.enum(['en', 'fr']).default('en'),
})

export async function GET(req: Request, { params }: TourPaymentContext) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const { tourBookingId } = await params
  const rateLimit = await checkRateLimit({
    scope: 'mobile-tour-payment-status',
    identifier: `${guard.principal.userId}:${tourBookingId}:${requestIp(req)}`,
    limit: 60,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many payment status checks', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const result = await getMobileTourBookingPayment({ principal: guard.principal, tourBookingId })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    payment: result.dto,
    tourBooking: result.tourBooking,
  })
}

export async function POST(req: Request, { params }: TourPaymentContext) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const { tourBookingId } = await params
  const rateLimit = await checkRateLimit({
    scope: 'mobile-tour-payment-initiate',
    identifier: `${guard.principal.userId}:${tourBookingId}:${requestIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many payment attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = initSchema.safeParse(body ?? {})
  if (!parsed.success) return mobileValidationError('Invalid payment request', parsed.error.flatten())
  const currency = assertMobileLaunchCurrency(parsed.data.currency)
  if (!currency.ok) return mobileErrorFromCode(currency.code, currency.message)

  const result = await initiateMobileTourBookingPayment({
    tourBookingId,
    principal: guard.principal,
    provider: normalizeTourPaymentProvider(parsed.data.provider),
    locale: parsed.data.locale,
    origin: new URL(req.url).origin,
  })
  if (!result.ok) {
    return 'dto' in result
      ? mobileError(result.code, result.code, result.code === 'PAYMENT_ALREADY_COMPLETED' ? 409 : 409, {
          payment: result.dto,
        })
      : mobileErrorFromCode(result.code, result.message ?? undefined)
  }

  return Response.json(
    {
      payment: result.dto,
      reused: result.reused,
      zeroPayable: 'zeroPayable' in result ? result.zeroPayable : false,
    },
    { status: result.reused ? 200 : 201 }
  )
}
