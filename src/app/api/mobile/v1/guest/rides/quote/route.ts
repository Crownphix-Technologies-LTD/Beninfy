import { calculateMobileQuote } from '@/lib/mobile/bookingDiscovery'
import {
  mobileError,
  mobileErrorFromCode,
  mobileValidationError,
  type MobileErrorCode,
} from '@/lib/mobile/errors'
import {
  guestNoStoreHeaders,
  guestRideSelectionSchema,
  readGuestJson,
  toGuestRideQuoteDto,
} from '@/lib/mobile/guestDiscovery'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const limit = await checkRateLimit({
    scope: 'mobile-guest-ride-quote',
    identifier: requestIp(req),
    limit: 15,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return mobileError('RATE_LIMITED', 'Too many quote requests', 429, {
      retryAfter: limit.retryAfter,
    })

  const body = await readGuestJson(req)
  if (!body.ok)
    return mobileValidationError(
      body.reason === 'too_large' ? 'Quote request is too large' : 'Invalid quote request'
    )
  const parsed = guestRideSelectionSchema.safeParse(body.value)
  if (!parsed.success)
    return mobileValidationError('Invalid guest quote request', parsed.error.flatten())

  const result = await calculateMobileQuote(parsed.data)
  if (!result.ok) {
    if ('details' in result && result.details !== undefined)
      return mobileError(result.code as MobileErrorCode, result.message, 400, result.details)
    return mobileErrorFromCode(result.code as MobileErrorCode, result.message)
  }

  return Response.json(toGuestRideQuoteDto(result.data), {
    headers: guestNoStoreHeaders(),
  })
}
