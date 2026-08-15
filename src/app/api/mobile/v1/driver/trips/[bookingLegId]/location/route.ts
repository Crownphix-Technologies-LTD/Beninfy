import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  LOCATION_EXPIRES_MS,
  isTrackingEligibleStatus,
  shouldReplaceLocation,
  toLocationDto,
  upsertDriverPresence,
  validateLocationInput,
} from '@/lib/mobile/tracking'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const schema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracyMeters: z.number().optional().nullable(),
  headingDegrees: z.number().optional().nullable(),
  speedMetersPerSecond: z.number().optional().nullable(),
  capturedAt: z.string().optional().nullable(),
  sequence: z.number().int().optional().nullable(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingLegId: string }> }
) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')
  const { bookingLegId } = await params

  const rateLimit = await checkRateLimit({
    scope: 'mobile-driver-location',
    identifier: `${guard.principal.driverId}:${bookingLegId}:${requestIp(req)}`,
    limit: 120,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('LOCATION_RATE_LIMITED', 'Too many location updates', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid location payload', parsed.error.flatten())

  const now = new Date()
  const validation = validateLocationInput(parsed.data, now)
  if (!validation.ok) return mobileErrorFromCode(validation.code, validation.message)

  const leg = await prisma.bookingLeg.findFirst({
    where: {
      id: bookingLegId,
      driverId: guard.principal.driverId,
      booking: { status: { in: ['confirmed', 'completed'] } },
    },
    select: {
      id: true,
      bookingId: true,
      driverId: true,
      status: true,
    },
  })
  if (!leg) return mobileErrorFromCode('TRIP_NOT_ASSIGNED')
  if (!isTrackingEligibleStatus(leg.status)) {
    return mobileErrorFromCode('TRACKING_NOT_ACTIVE', 'Tracking is not active for this trip')
  }

  const expiresAt = new Date(now.getTime() + LOCATION_EXPIRES_MS)
  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.latestTripLocation.findUnique({
        where: { bookingLegId: leg.id },
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

      await upsertDriverPresence({
        driverId: guard.principal.driverId!,
        status: 'online',
        currentBookingLegId: leg.id,
        client: tx,
      })

      const location = await tx.latestTripLocation.upsert({
        where: { bookingLegId: leg.id },
        create: {
          bookingLegId: leg.id,
          driverId: guard.principal.driverId!,
          ...validation.value,
          receivedAt: now,
          expiresAt,
          sourceSessionId: guard.principal.sessionId,
        },
        update: {
          driverId: guard.principal.driverId!,
          ...validation.value,
          receivedAt: now,
          expiresAt,
          sourceSessionId: guard.principal.sessionId,
        },
      })
      return { ok: true as const, location }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )

  if (!result.ok) return mobileErrorFromCode('LOCATION_STALE', 'Older location update ignored')

  return Response.json({
    ok: true,
    bookingLegId: leg.id,
    trackingStatus: 'live',
    location: toLocationDto(result.location),
    realtimeEvent: {
      event: 'trip.location.updated',
      version: 1,
      bookingLegId: leg.id,
      bookingId: leg.bookingId,
      occurredAt: now.toISOString(),
      sequence: result.location.sequence,
    },
  })
}
