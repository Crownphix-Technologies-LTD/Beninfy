import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { publishTourDriverLocation } from '@/lib/mobile/tourTracking'

export const runtime = 'nodejs'
type DriverTourLocationContext =
  RouteContext<'/api/mobile/v1/driver/tours/[tourBookingDayId]/location'>

const schema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracyMeters: z.number().optional().nullable(),
  headingDegrees: z.number().optional().nullable(),
  speedMetersPerSecond: z.number().optional().nullable(),
  capturedAt: z.string().optional().nullable(),
  sequence: z.number().int().optional().nullable(),
})

export async function POST(req: Request, { params }: DriverTourLocationContext) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')
  const { tourBookingDayId } = await params

  const rateLimit = await checkRateLimit({
    scope: 'mobile-driver-tour-location',
    identifier: `${guard.principal.driverId}:${tourBookingDayId}:${requestIp(req)}`,
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
  if (!parsed.success) {
    return mobileValidationError('Invalid location payload', parsed.error.flatten())
  }

  const result = await publishTourDriverLocation({
    principal: guard.principal,
    tourBookingDayId,
    input: parsed.data,
  })
  if (!result.ok) return mobileErrorFromCode(result.code, 'message' in result ? result.message : undefined)

  return Response.json({
    ok: true,
    tourBookingDayId,
    trackingStatus: 'live',
    location: result.dto,
  })
}
