import type { Prisma } from '@prisma/client'
import { computeGoogleRoute, type LatLng } from '@/lib/maps/googleRoutes'
import { prisma } from '@/lib/prisma'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

export type JourneyTarget = 'pickup' | 'destination'

export type JourneyIntelligenceDto = {
  target: JourneyTarget
  distanceMeters: number | null
  durationSeconds: number | null
  encodedPolyline: string | null
  routePolyline?: string | null
  distanceRemainingMeters?: number | null
  estimatedArrivalAt?: string | null
  estimatedDurationSeconds?: number | null
  calculatedAt?: string | null
  freshness?: 'fresh' | 'stale' | 'unavailable'
} | null

const DEFAULT_CACHE_TTL_MS = Number(process.env.JOURNEY_ROUTE_CACHE_TTL_SECONDS ?? 5 * 60) * 1000
const RECALCULATE_AFTER_MS =
  Number(process.env.JOURNEY_ROUTE_RECALCULATE_SECONDS ?? 2 * 60) * 1000
export const JOURNEY_ROUTE_MOVEMENT_THRESHOLD_METERS = Number(
  process.env.JOURNEY_ROUTE_MOVEMENT_THRESHOLD_METERS ?? 150
)

function hasPoint(point: Partial<LatLng>): point is LatLng {
  return typeof point.latitude === 'number' && typeof point.longitude === 'number'
}

function legEndpointsFromBooking(booking: {
  pickupLatitude?: number | null
  pickupLongitude?: number | null
  dropoffLatitude?: number | null
  dropoffLongitude?: number | null
}, direction: string) {
  const pickup = {
    latitude: booking.pickupLatitude ?? undefined,
    longitude: booking.pickupLongitude ?? undefined,
  }
  const dropoff = {
    latitude: booking.dropoffLatitude ?? undefined,
    longitude: booking.dropoffLongitude ?? undefined,
  }
  if (!hasPoint(pickup) || !hasPoint(dropoff)) return null
  return direction === 'return'
    ? { pickup: dropoff, destination: pickup }
    : { pickup, destination: dropoff }
}

export function journeyTargetForLegStatus(status: string): JourneyTarget | null {
  switch (status) {
    case 'driver_en_route':
    case 'driver_arrived':
    case 'passenger_onboard':
      return 'pickup'
    case 'in_progress':
      return 'destination'
    default:
      return null
  }
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
  const h =
    sinLat * sinLat + Math.cos(latitudeA) * Math.cos(latitudeB) * sinLng * sinLng
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function shouldRefreshJourneySnapshot({
  snapshot,
  target,
  latestLocation,
  now = new Date(),
}: {
  snapshot: {
    target?: string | null
    originLatitude: number
    originLongitude: number
    calculatedAt: Date | string
    expiresAt: Date | string
  } | null
  target: JourneyTarget
  latestLocation: LatLng & { receivedAt?: Date | string | null }
  now?: Date
}) {
  if (!snapshot) return true
  if (snapshot.target !== target) return true
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

export function toJourneyIntelligenceDto(snapshot: {
  target?: string | null
  distanceMeters: number | null
  encodedPolyline: string | null
  distanceRemainingMeters: number | null
  estimatedArrivalAt: Date | string | null
  estimatedDurationSeconds: number | null
  calculatedAt: Date | string
  expiresAt: Date | string
} | null): JourneyIntelligenceDto {
  if (!snapshot) return null
  const expiresAt = new Date(snapshot.expiresAt)
  const durationSeconds = snapshot.estimatedDurationSeconds
  return {
    target: snapshot.target === 'destination' ? 'destination' : 'pickup',
    distanceMeters: snapshot.distanceRemainingMeters ?? snapshot.distanceMeters,
    durationSeconds,
    encodedPolyline: snapshot.encodedPolyline,
    routePolyline: snapshot.encodedPolyline,
    distanceRemainingMeters: snapshot.distanceRemainingMeters,
    estimatedArrivalAt: snapshot.estimatedArrivalAt
      ? new Date(snapshot.estimatedArrivalAt).toISOString()
      : null,
    estimatedDurationSeconds: durationSeconds,
    calculatedAt: new Date(snapshot.calculatedAt).toISOString(),
    freshness: expiresAt.getTime() > Date.now() ? 'fresh' : 'stale',
  }
}

export async function getOrRefreshJourneyIntelligence({
  bookingLegId,
  client = prisma,
}: {
  bookingLegId: string
  client?: PrismaClientLike
}) {
  const leg = await client.bookingLeg.findUnique({
    where: { id: bookingLegId },
    select: {
      id: true,
      direction: true,
      status: true,
      latestLocation: true,
      journeySnapshot: true,
      booking: {
        select: {
          pickupLatitude: true,
          pickupLongitude: true,
          dropoffLatitude: true,
          dropoffLongitude: true,
        },
      },
    },
  })
  if (!leg) return null

  const target = journeyTargetForLegStatus(leg.status)
  if (!target || !leg.latestLocation) return null

  const now = Date.now()
  if (
    leg.journeySnapshot &&
    !shouldRefreshJourneySnapshot({
      snapshot: leg.journeySnapshot,
      target,
      latestLocation: leg.latestLocation,
      now: new Date(now),
    })
  ) {
    return leg.journeySnapshot
  }

  const endpoints = legEndpointsFromBooking(leg.booking, leg.direction)
  if (!endpoints) return null

  const origin = { latitude: leg.latestLocation.latitude, longitude: leg.latestLocation.longitude }
  const destination = endpoints[target]
  const route = await computeGoogleRoute({
    origin,
    destination,
    trafficAware: true,
  })
  if (!route.ok) return leg.journeySnapshot?.target === target ? leg.journeySnapshot : null

  const calculatedAt = route.route.calculatedAt
  const estimatedDurationSeconds =
    route.route.trafficDurationSeconds ?? route.route.durationSeconds ?? null
  const estimatedArrivalAt =
    estimatedDurationSeconds == null
      ? null
      : new Date(calculatedAt.getTime() + estimatedDurationSeconds * 1000)
  const expiresAt = new Date(calculatedAt.getTime() + DEFAULT_CACHE_TTL_MS)

  return client.tripJourneySnapshot.upsert({
    where: { bookingLegId },
    create: {
      bookingLegId,
      target,
      originLatitude: origin.latitude,
      originLongitude: origin.longitude,
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
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
      originLatitude: origin.latitude,
      originLongitude: origin.longitude,
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude,
      encodedPolyline: route.route.encodedPolyline,
      distanceMeters: route.route.distanceMeters,
      durationSeconds: route.route.durationSeconds,
      trafficDurationSeconds: route.route.trafficDurationSeconds,
      distanceRemainingMeters: route.route.distanceMeters,
      estimatedDurationSeconds,
      estimatedArrivalAt,
      provider: route.route.provider,
      providerStatus: 'ok',
      target,
      calculatedAt,
      expiresAt,
    },
  })
}
