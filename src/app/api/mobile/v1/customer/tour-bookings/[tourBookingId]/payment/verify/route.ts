import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { verifyMobileTourBookingPayment } from '@/lib/mobile/tourPayments'

export const runtime = 'nodejs'
type TourPaymentVerifyContext =
  RouteContext<'/api/mobile/v1/customer/tour-bookings/[tourBookingId]/payment/verify'>

const verifySchema = z.object({
  reference: z.string().trim().min(1).max(100).optional(),
  providerReference: z.string().trim().min(1).max(160).optional(),
})

export async function POST(req: Request, { params }: TourPaymentVerifyContext) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok) {
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })
  }
  const { tourBookingId } = await params

  const rateLimit = await checkRateLimit({
    scope: 'mobile-tour-payment-verify',
    identifier: `${guard.principal.userId}:${tourBookingId}:${requestIp(req)}`,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many payment verification attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = verifySchema.safeParse(body ?? {})
  if (!parsed.success) {
    return mobileValidationError('Invalid verification request', parsed.error.flatten())
  }

  const result = await verifyMobileTourBookingPayment({
    tourBookingId,
    principal: guard.principal,
    reference: parsed.data.reference,
    providerReference: parsed.data.providerReference,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({ payment: result.dto })
}
