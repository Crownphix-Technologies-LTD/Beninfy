import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { getCustomerTourTracking } from '@/lib/mobile/tourTracking'

export const runtime = 'nodejs'
type TourTrackingContext =
  RouteContext<'/api/mobile/v1/customer/tour-bookings/[tourBookingId]/tracking'>

export async function GET(req: Request, { params }: TourTrackingContext) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { tourBookingId } = await params

  const rateLimit = await checkRateLimit({
    scope: 'mobile-customer-tour-tracking',
    identifier: `${guard.principal.userId}:${tourBookingId}:${requestIp(req)}`,
    limit: 120,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many tracking requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const result = await getCustomerTourTracking({
    principal: guard.principal,
    tourBookingId,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({ tracking: result.dto })
}
