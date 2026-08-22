import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { toDriverProfileDto, toDriverTripSummaryDto } from '@/lib/mobile/dtos'
import {
  ACTIVE_DRIVER_TRIP_STATUSES,
  UPCOMING_DRIVER_TRIP_STATUSES,
} from '@/lib/mobile/driverOperations'
import { appTypeForPrincipal } from '@/lib/mobile/notifications'
import { mobileSupportConfig } from '@/lib/mobile/supportConfig'

export const runtime = 'nodejs'

const tripInclude = {
  fleetVehicle: true,
  booking: {
    select: {
      status: true,
      passengerName: true,
      passengerPhone: true,
      pickupAddress: true,
      pickupLatitude: true,
      pickupLongitude: true,
      dropoffAddress: true,
      dropoffLatitude: true,
      dropoffLongitude: true,
    },
  },
} as const

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const [driver, currentActiveTrip, nextUpcomingTrip, notificationUnreadCount] = await Promise.all([
    prisma.driver.findUnique({
      where: { id: guard.principal.driverId },
      include: { presence: true, user: { select: { image: true } } },
    }),
    prisma.bookingLeg.findFirst({
      where: {
        driverId: guard.principal.driverId,
        status: { in: [...ACTIVE_DRIVER_TRIP_STATUSES] },
      },
      orderBy: [{ departureDate: 'asc' }, { id: 'asc' }],
      include: tripInclude,
    }),
    prisma.bookingLeg.findFirst({
      where: {
        driverId: guard.principal.driverId,
        status: { in: [...UPCOMING_DRIVER_TRIP_STATUSES] },
      },
      orderBy: [{ departureDate: 'asc' }, { id: 'asc' }],
      include: tripInclude,
    }),
    prisma.notification.count({
      where: {
        userId: guard.principal.userId,
        appType: appTypeForPrincipal(guard.principal),
        readAt: null,
      },
    }),
  ])

  if (!driver) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const active = currentActiveTrip ? toDriverTripSummaryDto(currentActiveTrip) : null
  const featured = active ?? (nextUpcomingTrip ? toDriverTripSummaryDto(nextUpcomingTrip) : null)

  return Response.json({
    home: {
      driver: toDriverProfileDto(driver),
      notificationUnreadCount,
      currentActiveTrip: active,
      featuredTrip: featured,
      support: mobileSupportConfig(),
    },
  })
}
