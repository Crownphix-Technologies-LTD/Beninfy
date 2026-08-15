import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { toCustomerTrackingSnapshotDto } from '@/lib/mobile/dtos'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
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
        },
      },
    },
  })

  if (!booking) return mobileErrorFromCode('BOOKING_NOT_FOUND')
  const leg = booking.legs[0]
  if (!leg) return mobileErrorFromCode('TRIP_NOT_FOUND')

  return Response.json({
    tracking: toCustomerTrackingSnapshotDto({
      bookingId: booking.id,
      principalId: guard.principal.userId,
      leg,
    }),
  })
}
