import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { quoteCustomerTourSelection } from '@/lib/mobile/tourBookings'
import { webTourBookingSchema } from '@/lib/webTourBookingContract'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const limit = await checkRateLimit({
    scope: 'web-tour-quote',
    identifier: requestIp(req),
    limit: 30,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return mobileError('RATE_LIMITED', 'Too many quote requests', 429, {
      retryAfter: limit.retryAfter,
    })

  const parsed = webTourBookingSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return mobileValidationError('Invalid Tour selection', parsed.error.flatten())

  const result = await quoteCustomerTourSelection(parsed.data)
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({ quote: result.dto })
}
