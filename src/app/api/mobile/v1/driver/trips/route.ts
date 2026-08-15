import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { toDriverTripSummaryDto } from '@/lib/mobile/dtos'
import {
  driverTripOrderByForView,
  driverTripWhereForView,
  normalizeDriverTripView,
} from '@/lib/mobile/driverOperations'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const url = new URL(req.url)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT))
  )
  const cursor = url.searchParams.get('cursor') || undefined
  const viewResult = normalizeDriverTripView(url.searchParams.get('view'))
  if (!viewResult.ok) return mobileErrorFromCode(viewResult.code)

  const trips = await prisma.bookingLeg.findMany({
    where: driverTripWhereForView(guard.principal.driverId, viewResult.view),
    orderBy: driverTripOrderByForView(viewResult.view),
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      fleetVehicle: true,
      booking: {
        select: {
          status: true,
          passengerName: true,
          passengerPhone: true,
          pickupAddress: true,
          dropoffAddress: true,
        },
      },
    },
  })
  const hasMore = trips.length > limit
  const page = hasMore ? trips.slice(0, limit) : trips

  return Response.json({
    view: viewResult.view,
    trips: page.map(toDriverTripSummaryDto),
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    },
  })
}
