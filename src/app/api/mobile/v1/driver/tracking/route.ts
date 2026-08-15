import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { toDriverTrackingSnapshotDto } from '@/lib/mobile/dtos'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { TRACKING_ENABLED_LEG_STATUSES } from '@/lib/mobile/tracking'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const trips = await prisma.bookingLeg.findMany({
    where: {
      driverId: guard.principal.driverId,
      status: { in: [...TRACKING_ENABLED_LEG_STATUSES] },
      booking: { status: { in: ['confirmed', 'completed'] } },
    },
    orderBy: [{ departureDate: 'asc' }, { updatedAt: 'desc' }],
    take: 5,
    include: {
      fleetVehicle: true,
      driver: true,
      latestLocation: true,
    },
  })

  return Response.json({
    tracking: trips.map((leg) =>
      toDriverTrackingSnapshotDto({ principalId: guard.principal.userId, leg })
    ),
  })
}
