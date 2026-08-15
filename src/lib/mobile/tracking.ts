import { createHmac, timingSafeEqual } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const TRACKING_ENABLED_LEG_STATUSES = [
  'driver_en_route',
  'driver_arrived',
  'passenger_onboard',
  'in_progress',
] as const

export const TRACKING_TERMINAL_LEG_STATUSES = ['completed', 'cancelled'] as const

export type TrackingStatus = 'live' | 'stale' | 'unavailable' | 'ended'
export type DriverPresenceStatus = 'online' | 'offline'

export const LOCATION_FRESH_MS = Number(process.env.TRACKING_LOCATION_FRESH_SECONDS ?? 90) * 1000
export const LOCATION_EXPIRES_MS =
  Number(process.env.TRACKING_LOCATION_EXPIRES_SECONDS ?? 15 * 60) * 1000
export const LOCATION_MAX_STALE_MS =
  Number(process.env.TRACKING_LOCATION_MAX_STALE_SECONDS ?? 15 * 60) * 1000
export const LOCATION_MAX_FUTURE_MS =
  Number(process.env.TRACKING_LOCATION_MAX_FUTURE_SECONDS ?? 5 * 60) * 1000
export const REALTIME_AUTH_TTL_SECONDS = Number(process.env.REALTIME_AUTH_TTL_SECONDS ?? 5 * 60)

export type LocationInput = {
  latitude: number
  longitude: number
  accuracyMeters?: number | null
  headingDegrees?: number | null
  speedMetersPerSecond?: number | null
  capturedAt?: string | null
  sequence?: number | null
}

export type LocationValidationResult =
  | {
      ok: true
      value: {
        latitude: number
        longitude: number
        accuracyMeters: number | null
        headingDegrees: number | null
        speedMetersPerSecond: number | null
        capturedAt: Date
        sequence: number | null
      }
    }
  | { ok: false; code: 'LOCATION_INVALID' | 'LOCATION_STALE'; message: string }

function trackingSecret() {
  const secret =
    process.env.REALTIME_AUTH_SECRET || process.env.MOBILE_AUTH_SECRET || process.env.AUTH_SECRET
  if (!secret)
    throw new Error(
      'REALTIME_AUTH_SECRET, MOBILE_AUTH_SECRET, or AUTH_SECRET is required for tracking auth'
    )
  return secret
}

function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateLocationInput(
  input: LocationInput,
  now = new Date()
): LocationValidationResult {
  if (!numeric(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    return { ok: false, code: 'LOCATION_INVALID', message: 'Latitude is invalid' }
  }
  if (!numeric(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    return { ok: false, code: 'LOCATION_INVALID', message: 'Longitude is invalid' }
  }
  if (
    input.accuracyMeters != null &&
    (!numeric(input.accuracyMeters) || input.accuracyMeters < 0 || input.accuracyMeters > 5000)
  ) {
    return { ok: false, code: 'LOCATION_INVALID', message: 'Accuracy is invalid' }
  }
  if (
    input.headingDegrees != null &&
    (!numeric(input.headingDegrees) || input.headingDegrees < 0 || input.headingDegrees > 360)
  ) {
    return { ok: false, code: 'LOCATION_INVALID', message: 'Heading is invalid' }
  }
  if (
    input.speedMetersPerSecond != null &&
    (!numeric(input.speedMetersPerSecond) ||
      input.speedMetersPerSecond < 0 ||
      input.speedMetersPerSecond > 90)
  ) {
    return { ok: false, code: 'LOCATION_INVALID', message: 'Speed is invalid' }
  }
  if (input.sequence != null && (!Number.isInteger(input.sequence) || input.sequence < 0)) {
    return { ok: false, code: 'LOCATION_INVALID', message: 'Sequence is invalid' }
  }

  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : now
  if (Number.isNaN(capturedAt.getTime())) {
    return { ok: false, code: 'LOCATION_INVALID', message: 'Captured time is invalid' }
  }
  if (capturedAt.getTime() < now.getTime() - LOCATION_MAX_STALE_MS) {
    return { ok: false, code: 'LOCATION_STALE', message: 'Location update is too old' }
  }
  if (capturedAt.getTime() > now.getTime() + LOCATION_MAX_FUTURE_MS) {
    return {
      ok: false,
      code: 'LOCATION_STALE',
      message: 'Location update is too far in the future',
    }
  }

  return {
    ok: true,
    value: {
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters ?? null,
      headingDegrees: input.headingDegrees ?? null,
      speedMetersPerSecond: input.speedMetersPerSecond ?? null,
      capturedAt,
      sequence: input.sequence ?? null,
    },
  }
}

export function isTrackingEligibleStatus(status: string) {
  return (TRACKING_ENABLED_LEG_STATUSES as readonly string[]).includes(status)
}

export function isTrackingEndedStatus(status: string) {
  return (
    (TRACKING_TERMINAL_LEG_STATUSES as readonly string[]).includes(status) ||
    status === 'unassigned' ||
    status === 'payment_pending'
  )
}

export function trackingStatusFor({
  legStatus,
  hasDriver,
  lastLocationReceivedAt,
  lastLocationExpiresAt,
  now = new Date(),
}: {
  legStatus: string
  hasDriver: boolean
  lastLocationReceivedAt?: Date | string | null
  lastLocationExpiresAt?: Date | string | null
  now?: Date
}): TrackingStatus {
  if (isTrackingEndedStatus(legStatus)) return 'ended'
  if (!hasDriver || !isTrackingEligibleStatus(legStatus)) return 'unavailable'
  if (!lastLocationReceivedAt) return 'unavailable'
  if (lastLocationExpiresAt) {
    const expiresAt =
      lastLocationExpiresAt instanceof Date
        ? lastLocationExpiresAt
        : new Date(lastLocationExpiresAt)
    if (expiresAt.getTime() < now.getTime()) return 'unavailable'
  }

  const receivedAt =
    lastLocationReceivedAt instanceof Date
      ? lastLocationReceivedAt
      : new Date(lastLocationReceivedAt)
  if (receivedAt.getTime() + LOCATION_FRESH_MS >= now.getTime()) return 'live'
  return 'stale'
}

export function realtimeChannelForTrip(bookingLegId: string) {
  return `trip:${bookingLegId}:tracking`
}

export function realtimeChannelForDriver(driverId: string) {
  return `driver:${driverId}:presence`
}

export function signRealtimeScope({
  principalType,
  principalId,
  bookingLegId,
  channel,
  permission,
  ttlSeconds = REALTIME_AUTH_TTL_SECONDS,
}: {
  principalType: 'customer' | 'driver'
  principalId: string
  bookingLegId: string
  channel: string
  permission: 'subscribe' | 'publish'
  ttlSeconds?: number
}) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = {
    version: 1,
    principalType,
    principalId,
    bookingLegId,
    channel,
    permission,
    expiresAt,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', trackingSecret()).update(body).digest('base64url')
  return {
    token: `${body}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    channel,
    provider: 'supabase-broadcast' as const,
    permission,
  }
}

export function verifyRealtimeScope(token: string) {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', trackingSecret()).update(body).digest('base64url')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      version: number
      principalType: 'customer' | 'driver'
      principalId: string
      bookingLegId: string
      channel: string
      permission: 'subscribe' | 'publish'
      expiresAt: number
    }
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function toLocationDto(
  location: {
    latitude: number
    longitude: number
    accuracyMeters: number | null
    headingDegrees: number | null
    speedMetersPerSecond: number | null
    sequence: number | null
    capturedAt: Date | string
    receivedAt: Date | string
    expiresAt: Date | string
  } | null
) {
  if (!location) return null
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters,
    headingDegrees: location.headingDegrees,
    speedMetersPerSecond: location.speedMetersPerSecond,
    sequence: location.sequence,
    capturedAt: new Date(location.capturedAt).toISOString(),
    receivedAt: new Date(location.receivedAt).toISOString(),
    expiresAt: new Date(location.expiresAt).toISOString(),
  }
}

export function shouldReplaceLocation({
  existing,
  nextCapturedAt,
  nextSequence,
}: {
  existing: { capturedAt: Date; sequence: number | null } | null
  nextCapturedAt: Date
  nextSequence: number | null
}) {
  if (!existing) return true
  if (nextSequence != null && existing.sequence != null) return nextSequence >= existing.sequence
  return nextCapturedAt.getTime() >= existing.capturedAt.getTime()
}

export async function upsertDriverPresence({
  driverId,
  status,
  currentBookingLegId,
  client = prisma,
}: {
  driverId: string
  status: DriverPresenceStatus
  currentBookingLegId?: string | null
  client?: typeof prisma | Prisma.TransactionClient
}) {
  const now = new Date()
  return client.driverPresence.upsert({
    where: { driverId },
    create: {
      driverId,
      status,
      lastSeenAt: now,
      lastHeartbeatAt: status === 'online' ? now : null,
      currentBookingLegId: currentBookingLegId ?? null,
    },
    update: {
      status,
      lastSeenAt: now,
      lastHeartbeatAt: status === 'online' ? now : undefined,
      currentBookingLegId: currentBookingLegId ?? null,
    },
  })
}

export function lifecycleRealtimeEvent({
  event,
  bookingLegId,
  bookingId,
  status,
  sequence,
  occurredAt = new Date(),
}: {
  event: string
  bookingLegId: string
  bookingId: string
  status: string
  sequence?: number | null
  occurredAt?: Date
}) {
  return {
    event,
    version: 1,
    bookingLegId,
    bookingId,
    status,
    sequence: sequence ?? null,
    occurredAt: occurredAt.toISOString(),
  }
}
