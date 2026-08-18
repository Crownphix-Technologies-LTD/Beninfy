import type { Prisma } from '@prisma/client'
import { computeGoogleRoute, type LatLng } from '@/lib/maps/googleRoutes'
import { prisma } from '@/lib/prisma'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

export type JourneyIntelligenceDto = {
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

function hasPoint(point: Partial<LatLng>): point is LatLng {
  return typeof point.latitude === 'number' && typeof point.longitude === 'number'
}

function pointFromBooking(booking: {
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
  if (direction === 'return') {
    return hasPoint(pickup) && hasPoint(dropoff) ? { origin: dropoff, destination: pickup } : null
  }
  return hasPoint(pickup) && hasPoint(dropoff) ? { origin: pickup, destination: dropoff } : null
}

export function toJourneyIntelligenceDto(snapshot: {
  encodedPolyline: string | null
  distanceRemainingMeters: number | null
  estimatedArrivalAt: Date | string | null
  estimatedDurationSeconds: number | null
  calculatedAt: Date | string
  expiresAt: Date | string
} | null): JourneyIntelligenceDto {
  if (!snapshot) return null
  const expiresAt = new Date(snapshot.expiresAt)
  return {
    routePolyline: snapshot.encodedPolyline,
    distanceRemainingMeters: snapshot.distanceRemainingMeters,
    estimatedArrivalAt: snapshot.estimatedArrivalAt
      ? new Date(snapshot.estimatedArrivalAt).toISOString()
      : null,
    estimatedDurationSeconds: snapshot.estimatedDurationSeconds,
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
  if (['completed', 'cancelled'].includes(leg.status)) {
    return leg.journeySnapshot
  }

  const now = Date.now()
  if (
    leg.journeySnapshot &&
    new Date(leg.journeySnapshot.calculatedAt).getTime() + RECALCULATE_AFTER_MS > now
  ) {
    return leg.journeySnapshot
  }

  const endpoints = pointFromBooking(leg.booking, leg.direction)
  if (!endpoints) return leg.journeySnapshot

  const origin = leg.latestLocation
    ? { latitude: leg.latestLocation.latitude, longitude: leg.latestLocation.longitude }
    : endpoints.origin
  const route = await computeGoogleRoute({
    origin,
    destination: endpoints.destination,
    trafficAware: true,
  })
  if (!route.ok) return leg.journeySnapshot

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
      originLatitude: origin.latitude,
      originLongitude: origin.longitude,
      destinationLatitude: endpoints.destination.latitude,
      destinationLongitude: endpoints.destination.longitude,
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
      destinationLatitude: endpoints.destination.latitude,
      destinationLongitude: endpoints.destination.longitude,
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

