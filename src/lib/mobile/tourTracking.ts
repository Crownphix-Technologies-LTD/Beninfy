import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { computeGoogleRoute, type LatLng } from '@/lib/maps/googleRoutes'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import {
  LOCATION_EXPIRES_MS,
  trackingStatusFor,
  shouldReplaceLocation,
  toLocationDto,
  upsertDriverPresence,
  validateLocationInput,
  type LocationInput,
} from '@/lib/mobile/tracking'
import {
  currentTourStop,
  nextTourStop,
  tourDayInclude,
  type TourDayForDto,
} from '@/lib/mobile/tourExecution'
import { toTourBookingDayDto } from '@/lib/mobile/tourBookings'
import {
  JOURNEY_ROUTE_MOVEMENT_THRESHOLD_METERS,
  toJourneyIntelligenceDto,
} from '@/lib/mobile/journeyIntelligence'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

export const TOUR_TRACKING_ENABLED_DAY_STATUSES = [
  'driver_en_route',
  'driver_arrived',
  'in_progress',
] as const

export type TourJourneyTarget = 'pickup' | 'stop'

type TourDayWithTracking = TourDayForDto & {
  latestLocation?: Parameters<typeof toLocationDto>[0] | null
  journeySnapshot?: Parameters<typeof toJourneyIntelligenceDto>[0] | null
}

const DEFAULT_CACHE_TTL_MS = Number(process.env.JOURNEY_ROUTE_CACHE_TTL_SECONDS ?? 5 * 60) * 1000
const RECALCULATE_AFTER_MS =
  Number(process.env.JOURNEY_ROUTE_RECALCULATE_SECONDS ?? 2 * 60) * 1000

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null
}

function isTourTrackingEligibleStatus(status: string) {
  return (TOUR_TRACKING_ENABLED_DAY_STATUSES as readonly string[]).includes(status)
}

function tourTrackingStatusFor({
  dayStatus,
  hasDriver,
  lastLocationReceivedAt,
  lastLocationExpiresAt,
  now = new Date(),
}: {
  dayStatus: string
  hasDriver: boolean
  lastLocationReceivedAt?: Date | string | null
  lastLocationExpiresAt?: Date | string | null
  now?: Date
}) {
  if (['completed', 'cancelled'].includes(dayStatus)) return 'ended' as const
  return trackingStatusFor({
    legStatus: isTourTrackingEligibleStatus(dayStatus) ? 'driver_en_route' : 'reserved',
    hasDriver,
    lastLocationReceivedAt,
    lastLocationExpiresAt,
    now,
  })
}

function hasPoint(point: Partial<LatLng>): point is LatLng {
  return typeof point.latitude === 'number' && typeof point.longitude === 'number'
}

function distanceBetweenMeters(a: LatLng, b: LatLng) {
  const earthRadiusMeters = 6371000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(b.latitude - a.latitude)
  const longitudeDelta = toRadians(b.longitude - a.longitude)
  const latitudeA = toRadians(a.latitude)
  const latitudeB = toRadians(b.latitude)
  const sinLat = Math.sin(latitudeDelta / 2)
  const sinLng = Math.sin(longitudeDelta / 2)
  const h = sinLat * sinLat + Math.cos(latitudeA) * Math.cos(latitudeB) * sinLng * sinLng
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function tourJourneyTargetForDay(day: TourDayForDto) {
  if (day.status === 'driver_en_route') {
    const pickup = {
      latitude: day.pickupLatitude ?? undefined,
      longitude: day.pickupLongitude ?? undefined,
    }
    return hasPoint(pickup)
      ? { type: 'pickup' as const, id: day.id, coordinates: pickup }
      : null
  }
  if (day.status === 'in_progress') {
    const stop = currentTourStop(day.stops)
    if (!stop) return null
    return {
      type: 'stop' as const,
      id: stop.id,
      coordinates: { latitude: stop.latitude, longitude: stop.longitude },
    }
  }
  return null
}

function shouldRefreshTourJourneySnapshot({
  snapshot,
  target,
  latestLocation,
  now = new Date(),
}: {
  snapshot: {
    target?: string | null
    targetStopId?: string | null
    destinationLatitude: number
    destinationLongitude: number
    originLatitude: number
    originLongitude: number
    calculatedAt: Date | string
    expiresAt: Date | string
  } | null
  target: { type: TourJourneyTarget; id: string; coordinates: LatLng }
  latestLocation: LatLng & { receivedAt?: Date | string | null }
  now?: Date
}) {
  if (!snapshot) return true
  if (snapshot.target !== target.type) return true
  if (
    snapshot.destinationLatitude !== target.coordinates.latitude ||
    snapshot.destinationLongitude !== target.coordinates.longitude
  )
    return true
  if ((snapshot.targetStopId ?? null) !== (target.type === 'stop' ? target.id : null)) return true
  if (new Date(snapshot.expiresAt).getTime() <= now.getTime()) return true

  const movedMeters = distanceBetweenMeters(
    { latitude: snapshot.originLatitude, longitude: snapshot.originLongitude },
    latestLocation
  )
  if (movedMeters >= JOURNEY_ROUTE_MOVEMENT_THRESHOLD_METERS) return true

  if (!latestLocation.receivedAt) return false
  const receivedAt = new Date(latestLocation.receivedAt).getTime()
  const calculatedAt = new Date(snapshot.calculatedAt).getTime()
  return receivedAt > calculatedAt && calculatedAt + RECALCULATE_AFTER_MS <= now.getTime()
}

export async function publishTourDriverLocation({
  principal,
  tourBookingDayId,
  input,
}: {
  principal: MobilePrincipal
  tourBookingDayId: string
  input: LocationInput
}) {
  if (!principal.driverId) return { ok: false as const, code: 'DRIVER_NOT_LINKED' as MobileErrorCode }
  const now = new Date()
  const validation = validateLocationInput(input, now)
  if (!validation.ok) return validation

  const day = await prisma.tourBookingDay.findFirst({
    where: {
      id: tourBookingDayId,
      assignedDriverId: principal.driverId,
      tourBooking: { status: { in: ['confirmed', 'active', 'completed'] }, paymentStatus: 'paid' },
    },
    select: { id: true, status: true },
  })
  if (!day) return { ok: false as const, code: 'TOUR_DAY_NOT_ASSIGNED' as MobileErrorCode }
  if (!isTourTrackingEligibleStatus(day.status)) {
    return { ok: false as const, code: 'TRACKING_NOT_ACTIVE' as MobileErrorCode }
  }

  const expiresAt = new Date(now.getTime() + LOCATION_EXPIRES_MS)
  const result = await prisma.$transaction(
    async (tx) => {
      const ownedDay = await tx.tourBookingDay.findFirst({
        where: {
          id: day.id,
          assignedDriverId: principal.driverId,
          tourBooking: { status: { in: ['confirmed', 'active', 'completed'] }, paymentStatus: 'paid' },
        },
        select: { id: true, status: true },
      })
      if (!ownedDay) return { ok: false as const, code: 'TOUR_DAY_NOT_ASSIGNED' as MobileErrorCode }
      if (!isTourTrackingEligibleStatus(ownedDay.status)) {
        return { ok: false as const, code: 'TRACKING_NOT_ACTIVE' as MobileErrorCode }
      }
      const existing = await tx.latestTourLocation.findUnique({
        where: { tourBookingDayId: day.id },
        select: { capturedAt: true, sequence: true },
      })
      if (
        !shouldReplaceLocation({
          existing,
          nextCapturedAt: validation.value.capturedAt,
          nextSequence: validation.value.sequence,
        })
      ) {
        return { ok: false as const }
      }
      const location = await tx.latestTourLocation.upsert({
        where: { tourBookingDayId: day.id },
        create: {
          tourBookingDayId: day.id,
          driverId: principal.driverId!,
          ...validation.value,
          receivedAt: now,
          expiresAt,
          sourceSessionId: principal.sessionId,
        },
        update: {
          driverId: principal.driverId!,
          ...validation.value,
          receivedAt: now,
          expiresAt,
          sourceSessionId: principal.sessionId,
        },
      })
      await upsertDriverPresence({
        driverId: principal.driverId!,
        status: 'online',
        currentBookingLegId: null,
        client: tx,
      })
      return { ok: true as const, location }
    },
    { isolationLevel: 'Serializable' }
  )

  if ('code' in result) return { ok: false as const, code: result.code }
  if (!result.ok) return { ok: false as const, code: 'LOCATION_STALE' as MobileErrorCode }
  return {
    ok: true as const,
    location: result.location,
    dto: toLocationDto(result.location),
  }
}

export async function getOrRefreshTourJourneyIntelligence({
  tourBookingDayId,
  client = prisma,
}: {
  tourBookingDayId: string
  client?: PrismaClientLike
}) {
  const day = await client.tourBookingDay.findUnique({
    where: { id: tourBookingDayId },
    include: {
      latestLocation: true,
      journeySnapshot: true,
      stops: { orderBy: { sortOrder: 'asc' } },
      tourBooking: {
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          days: {
            select: { id: true, dayNumber: true, status: true },
            orderBy: { dayNumber: 'asc' },
          },
        },
      },
    },
  })
  if (!day || !day.latestLocation) return null
  const target = tourJourneyTargetForDay(day)
  if (!target) return null
  if (
    day.journeySnapshot &&
    !shouldRefreshTourJourneySnapshot({
      snapshot: day.journeySnapshot,
      target,
      latestLocation: day.latestLocation,
    })
  ) {
    return day.journeySnapshot
  }
  const origin = {
    latitude: day.latestLocation.latitude,
    longitude: day.latestLocation.longitude,
  }
  const route = await computeGoogleRoute({
    origin,
    destination: target.coordinates,
    trafficAware: true,
  })
  if (!route.ok) {
    const existingTargetMatches =
      day.journeySnapshot?.target === target.type &&
      (day.journeySnapshot.targetStopId ?? null) === (target.type === 'stop' ? target.id : null) &&
      day.journeySnapshot.destinationLatitude === target.coordinates.latitude &&
      day.journeySnapshot.destinationLongitude === target.coordinates.longitude
    return existingTargetMatches ? day.journeySnapshot : null
  }

  const calculatedAt = route.route.calculatedAt
  const estimatedDurationSeconds =
    route.route.trafficDurationSeconds ?? route.route.durationSeconds ?? null
  const estimatedArrivalAt =
    estimatedDurationSeconds == null
      ? null
      : new Date(calculatedAt.getTime() + estimatedDurationSeconds * 1000)
  const expiresAt = new Date(calculatedAt.getTime() + DEFAULT_CACHE_TTL_MS)

  const persist = async (tx: Prisma.TransactionClient) => {
    // A Google request can finish after Operations changes pickup. Lock and
    // recheck the target before allowing that result back into the cache.
    await tx.$queryRaw`SELECT id FROM "TourBookingDay" WHERE id = ${tourBookingDayId} FOR UPDATE`
    const current = await tx.tourBookingDay.findUnique({
      where: { id: tourBookingDayId },
      include: tourDayInclude,
    })
    const currentTarget = current ? tourJourneyTargetForDay(current) : null
    if (
      !currentTarget ||
      currentTarget.type !== target.type ||
      currentTarget.id !== target.id ||
      currentTarget.coordinates.latitude !== target.coordinates.latitude ||
      currentTarget.coordinates.longitude !== target.coordinates.longitude
    )
      return null
    return tx.tourJourneySnapshot.upsert({
      where: { tourBookingDayId },
      create: {
        tourBookingDayId,
        target: target.type,
        targetStopId: target.type === 'stop' ? target.id : null,
        originLatitude: origin.latitude,
        originLongitude: origin.longitude,
        destinationLatitude: target.coordinates.latitude,
        destinationLongitude: target.coordinates.longitude,
        encodedPolyline: route.route.encodedPolyline,
        distanceMeters: route.route.distanceMeters,
        durationSeconds: route.route.durationSeconds,
        trafficDurationSeconds: route.route.trafficDurationSeconds,
        distanceRemainingMeters: route.route.distanceMeters,
        estimatedDurationSeconds,
        estimatedArrivalAt,
        provider: route.route.provider,
        calculatedAt,
        expiresAt,
      },
      update: {
        target: target.type,
        targetStopId: target.type === 'stop' ? target.id : null,
        originLatitude: origin.latitude,
        originLongitude: origin.longitude,
        destinationLatitude: target.coordinates.latitude,
        destinationLongitude: target.coordinates.longitude,
        encodedPolyline: route.route.encodedPolyline,
        distanceMeters: route.route.distanceMeters,
        durationSeconds: route.route.durationSeconds,
        trafficDurationSeconds: route.route.trafficDurationSeconds,
        distanceRemainingMeters: route.route.distanceMeters,
        estimatedDurationSeconds,
        estimatedArrivalAt,
        provider: route.route.provider,
        providerStatus: 'ok',
        calculatedAt,
        expiresAt,
      },
    })
  }
  return '$transaction' in client ? client.$transaction(persist) : persist(client)
}

function selectCurrentTourDay(days: TourDayWithTracking[]) {
  const ordered = [...days].sort((left, right) => left.dayNumber - right.dayNumber)
  return (
    ordered.find((day) => ['driver_en_route', 'driver_arrived', 'in_progress'].includes(day.status)) ??
    ordered.find((day) => !['completed', 'cancelled'].includes(day.status)) ??
    ordered[ordered.length - 1] ??
    null
  )
}

export async function getCustomerTourTracking({
  principal,
  tourBookingId,
}: {
  principal: MobilePrincipal
  tourBookingId: string
}) {
  const booking = await prisma.tourBooking.findFirst({
    where: { id: tourBookingId, userId: principal.userId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      days: {
        orderBy: { dayNumber: 'asc' },
        include: {
          ...tourDayInclude,
          latestLocation: true,
          journeySnapshot: true,
        },
      },
    },
  })
  if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as MobileErrorCode }
  const currentDay = selectCurrentTourDay(booking.days)
  if (!currentDay) return { ok: false as const, code: 'TOUR_DAY_NOT_FOUND' as MobileErrorCode }
  const journeySnapshot = await getOrRefreshTourJourneyIntelligence({
    tourBookingDayId: currentDay.id,
  }).catch(() => null)
  const journeyIntelligence = toJourneyIntelligenceDto(journeySnapshot ?? null)
  const currentDayDto = toTourBookingDayDto(
    { ...currentDay, journeySnapshot: journeySnapshot ?? null },
    booking.days.length
  )
  const currentStop = currentTourStop(currentDay.stops)
  const nextStop = nextTourStop(currentDay.stops, currentStop?.id)
  const trackingStatus = tourTrackingStatusFor({
    dayStatus: currentDay.status,
    hasDriver: Boolean(currentDay.assignedDriverId),
    lastLocationReceivedAt: currentDay.latestLocation?.receivedAt,
    lastLocationExpiresAt: currentDay.latestLocation?.expiresAt,
  })

  return {
    ok: true as const,
    dto: {
      tourBookingId: booking.id,
      reference: booking.reference,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      currentDay: {
        ...currentDayDto,
        tracking: {
          ...currentDayDto.tracking,
          journey: journeyIntelligence,
        },
      },
      dayNumber: currentDay.dayNumber,
      totalDays: booking.days.length,
      currentStop: currentStop
        ? {
            id: currentStop.id,
            stopNumber: currentDay.stops.findIndex((stop) => stop.id === currentStop.id) + 1,
            title: currentStop.title,
            titleFr: currentStop.titleFr,
            address: currentStop.address,
            coordinates: { latitude: currentStop.latitude, longitude: currentStop.longitude },
            status: currentStop.status,
          }
        : null,
      nextStop: nextStop
        ? {
            id: nextStop.id,
            stopNumber: currentDay.stops.findIndex((stop) => stop.id === nextStop.id) + 1,
            title: nextStop.title,
            titleFr: nextStop.titleFr,
            address: nextStop.address,
            coordinates: { latitude: nextStop.latitude, longitude: nextStop.longitude },
            status: nextStop.status,
          }
        : null,
      progress: {
        completedStopCount: currentDay.stops.filter((stop) => stop.status === 'completed').length,
        totalStopCount: currentDay.stops.length,
      },
      driver: currentDay.assignedDriver,
      vehicle: currentDay.assignedFleetVehicle,
      trackingStatus,
      locationFresh: trackingStatus === 'live',
      latestLocation: toLocationDto(currentDay.latestLocation ?? null),
      journeyIntelligence,
      routeTarget: tourJourneyTargetForDay(currentDay),
      updatedAt: iso(currentDay.updatedAt),
    },
  }
}
