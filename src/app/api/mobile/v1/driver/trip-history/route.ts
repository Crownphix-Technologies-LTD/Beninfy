import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { toDriverAssignmentHistoryDto } from '@/lib/mobile/dtos'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import {
  driverAssignmentHistoryOrderBy,
  driverAssignmentHistoryWhereForDriver,
} from '@/lib/mobile/driverAssignmentHistory'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const url = new URL(req.url)
  const parsedLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT)
  )
  const cursor = url.searchParams.get('cursor') || undefined

  const records = await prisma.driverTripAssignmentHistory.findMany({
    where: driverAssignmentHistoryWhereForDriver(guard.principal.driverId),
    orderBy: driverAssignmentHistoryOrderBy(),
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      bookingLeg: {
        select: {
          id: true,
          bookingId: true,
          direction: true,
          from: true,
          to: true,
          departureDate: true,
          status: true,
        },
      },
    },
  })

  const hasMore = records.length > limit
  const page = hasMore ? records.slice(0, limit) : records

  return Response.json({
    history: page.map(toDriverAssignmentHistoryDto),
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      limit,
    },
  })
}
