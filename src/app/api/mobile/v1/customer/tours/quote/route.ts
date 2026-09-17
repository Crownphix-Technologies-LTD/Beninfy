import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { tourCommercialSelectionSchema } from '@/lib/tourCommercial'
import { tourPickupSchema } from '@/lib/mobile/tourPickup'
import { quoteCustomerTourSelection } from '@/lib/mobile/tourBookings'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'
const schema = tourCommercialSelectionSchema.safeExtend({
  startDate: z.string().trim(),
  pickup: tourPickupSchema,
  travellers: z.number().int(),
})

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok) return mobileErrorFromCode(onboarding.code)
  const limit = await checkRateLimit({
    scope: 'mobile-tour-quote',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 30,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return mobileError('RATE_LIMITED', 'Too many quote requests', 429, {
      retryAfter: limit.retryAfter,
    })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return mobileValidationError('Invalid Tour selection', parsed.error.flatten())
  const result = await quoteCustomerTourSelection(parsed.data)
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({ quote: result.dto })
}
