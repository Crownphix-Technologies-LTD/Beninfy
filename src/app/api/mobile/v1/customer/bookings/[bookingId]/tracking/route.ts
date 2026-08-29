import { prisma } from '@/lib/prisma'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { toCustomerTrackingSnapshotDto } from '@/lib/mobile/dtos'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { getOrRefreshJourneyIntelligence } from '@/lib/mobile/journeyIntelligence'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const rateLimit = await checkRateLimit({
    scope: 'mobile-customer-tracking',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 120,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many tracking requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })
  const { bookingId } = await params
  const url = new URL(req.url)
  const bookingLegId = url.searchParams.get('bookingLegId') || undefined

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      userId: guard.principal.userId,
    },
    select: {
      id: true,
      legs: {
        where: bookingLegId ? { id: bookingLegId } : undefined,
        orderBy: { departureDate: 'asc' },
        take: 1,
        include: {
          fleetVehicle: true,
          driver: true,
          latestLocation: true,
          journeySnapshot: true,
        },
      },
    },
  })

  if (!booking) return mobileErrorFromCode('BOOKING_NOT_FOUND')
  const leg = booking.legs[0]
  if (!leg) return mobileErrorFromCode('TRIP_NOT_FOUND')
  const journeySnapshot = await getOrRefreshJourneyIntelligence({ bookingLegId: leg.id }).catch(
    () => leg.journeySnapshot
  )

  return Response.json({
    tracking: toCustomerTrackingSnapshotDto({
      bookingId: booking.id,
      principalId: guard.principal.userId,
      leg: { ...leg, journeySnapshot },
    }),
  })
}
