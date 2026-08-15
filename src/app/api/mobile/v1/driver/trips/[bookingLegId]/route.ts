import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { toDriverTripDetailDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ bookingLegId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')
  const { bookingLegId } = await params

  const trip = await prisma.bookingLeg.findFirst({
    where: { id: bookingLegId, driverId: guard.principal.driverId },
    include: {
      fleetVehicle: true,
      booking: {
        select: {
          passengerName: true,
          passengerPhone: true,
          pickupAddress: true,
          dropoffAddress: true,
          passengers: true,
          travelers: true,
          specialRequirements: true,
        },
      },
    },
  })
  if (!trip) return mobileErrorFromCode('TRIP_NOT_FOUND')

  return Response.json({ trip: toDriverTripDetailDto(trip) })
}
