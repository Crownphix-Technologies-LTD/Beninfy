import { quoteCustomerTourSelection } from '@/lib/mobile/tourBookings'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  guestNoStoreHeaders,
  guestTourQuoteSchema,
  readGuestJson,
} from '@/lib/mobile/guestDiscovery'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const limit = await checkRateLimit({
    scope: 'mobile-guest-tour-quote',
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
      body.reason === 'too_large' ? 'Tour quote request is too large' : 'Invalid Tour selection'
    )
  const parsed = guestTourQuoteSchema.safeParse(body.value)
  if (!parsed.success)
    return mobileValidationError('Invalid guest Tour selection', parsed.error.flatten())

  const result = await quoteCustomerTourSelection(parsed.data)
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json(
    {
      quote: {
        ...result.dto,
        informationalOnly: true,
        revalidationRequired: true,
      },
    },
    { headers: guestNoStoreHeaders() }
  )
}
