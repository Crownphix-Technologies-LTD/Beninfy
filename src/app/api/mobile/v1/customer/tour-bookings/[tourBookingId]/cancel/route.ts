import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { cancelCustomerTourBooking } from '@/lib/mobile/tourBookings'

export const runtime = 'nodejs'
type TourCancelContext =
  RouteContext<'/api/mobile/v1/customer/tour-bookings/[tourBookingId]/cancel'>

export async function POST(req: Request, { params }: TourCancelContext) {
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
    scope: 'mobile-tour-cancel',
    identifier: `${guard.principal.userId}:${tourBookingId}:${requestIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many cancellation requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const result = await cancelCustomerTourBooking({
    principal: guard.principal,
    tourBookingId,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    cancellation: {
      tourBookingId: result.booking.id,
      bookingStatus: result.booking.status,
      paymentStatus: result.paymentStatus,
      cancelled: result.cancelled,
      idempotent: result.idempotent,
    },
    tourBooking: result.dto,
  })
}
