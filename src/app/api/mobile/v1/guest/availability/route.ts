import { calculateMobileAvailability } from '@/lib/mobile/bookingDiscovery'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  guestNoStoreHeaders,
  guestRideSelectionSchema,
  readGuestJson,
  toGuestAvailabilityDto,
} from '@/lib/mobile/guestDiscovery'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const limit = await checkRateLimit({
    scope: 'mobile-guest-availability',
    identifier: requestIp(req),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return mobileError('RATE_LIMITED', 'Too many availability requests', 429, {
      retryAfter: limit.retryAfter,
    })

  const body = await readGuestJson(req)
  if (!body.ok)
    return mobileValidationError(
      body.reason === 'too_large'
        ? 'Availability request is too large'
        : 'Invalid availability request'
    )
  const parsed = guestRideSelectionSchema.safeParse(body.value)
  if (!parsed.success)
    return mobileValidationError('Invalid guest availability request', parsed.error.flatten())

  const result = await calculateMobileAvailability(parsed.data)
  if (!result.ok) {
    if (result.details !== undefined)
      return mobileError(result.code, result.message, 400, result.details)
    return mobileErrorFromCode(result.code, result.message)
  }

  return Response.json(toGuestAvailabilityDto(result.data), {
    headers: guestNoStoreHeaders(),
  })
}
