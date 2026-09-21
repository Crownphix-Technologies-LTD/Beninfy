import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { checkRateLimit } from '@/lib/rateLimit'
import { setTourCoupon } from '@/lib/mobile/tourCoupons'

export const runtime = 'nodejs'
const schema = z.object({ code: z.string().trim().min(1).max(60) }).strict()
type Context = { params: Promise<{ tourBookingId: string }> }

async function mutate(req: Request, context: Context, remove: boolean) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403)
  const limit = await checkRateLimit({
    scope: 'mobile-tour-coupon',
    identifier: guard.principal.userId,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return mobileError('RATE_LIMITED', 'Too many coupon attempts', 429, {
      retryAfter: limit.retryAfter,
    })
  const parsed = remove ? null : schema.safeParse(await req.json().catch(() => null))
  if (parsed && !parsed.success)
    return mobileValidationError('Invalid coupon request', parsed.error.flatten())
  const { tourBookingId } = await context.params
  const result = await setTourCoupon({
    tourBookingId,
    principal: guard.principal,
    code: parsed?.success ? parsed.data.code : null,
  })
  if (!result.ok)
    return mobileErrorFromCode(result.code, 'message' in result ? result.message : undefined)
  return Response.json({ pricing: result.pricing })
}

export const POST = (req: Request, context: Context) => mutate(req, context, false)
export const DELETE = (req: Request, context: Context) => mutate(req, context, true)
