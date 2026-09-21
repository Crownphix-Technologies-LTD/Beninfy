import { z } from 'zod'
import { checkRateLimit } from '@/lib/rateLimit'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { setTourCoupon } from '@/lib/mobile/tourCoupons'
import { requireWebCustomer } from '@/lib/webCustomer'

export const runtime = 'nodejs'
const schema = z.object({ code: z.string().trim().min(1).max(60) }).strict()
type Context = { params: Promise<{ tourBookingId: string }> }

async function mutate(req: Request, { params }: Context, remove: boolean) {
  const guard = await requireWebCustomer()
  if (!guard.ok) return mobileErrorFromCode(guard.code)
  const limit = await checkRateLimit({
    scope: 'web-tour-coupon',
    identifier: guard.principal.userId,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed) return mobileError('RATE_LIMITED', 'Too many coupon attempts', 429)
  const parsed = remove ? null : schema.safeParse(await req.json().catch(() => null))
  if (parsed && !parsed.success) return mobileValidationError('Invalid coupon request')
  const { tourBookingId } = await params
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
