import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { listCustomerTourBookings } from '@/lib/mobile/tourBookings'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const rateLimit = await checkRateLimit({
    scope: 'mobile-tour-booking-list',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 80,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many tour booking requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const tourBookings = await listCustomerTourBookings(guard.principal)
  return Response.json({ tourBookings })
}
