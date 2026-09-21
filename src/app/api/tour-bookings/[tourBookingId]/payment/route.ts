import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  getMobileTourBookingPayment,
  initiateMobileTourBookingPayment,
} from '@/lib/mobile/tourPayments'
import { requireWebCustomer } from '@/lib/webCustomer'

export const runtime = 'nodejs'
const schema = z.object({
  provider: z.enum(['paystack', 'payonus']),
  locale: z.enum(['en', 'fr']).default('en'),
})
type Context = { params: Promise<{ tourBookingId: string }> }

export async function GET(_req: Request, { params }: Context) {
  const guard = await requireWebCustomer()
  if (!guard.ok) return mobileErrorFromCode(guard.code)
  const { tourBookingId } = await params
  const result = await getMobileTourBookingPayment({
    principal: guard.principal,
    tourBookingId,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({ payment: result.dto, tourBooking: result.tourBooking })
}

export async function POST(req: Request, { params }: Context) {
  const guard = await requireWebCustomer()
  if (!guard.ok) return mobileErrorFromCode(guard.code)
  const { tourBookingId } = await params
  const limit = await checkRateLimit({
    scope: 'web-tour-payment-initiate',
    identifier: `${guard.principal.userId}:${tourBookingId}:${requestIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed) return mobileError('RATE_LIMITED', 'Too many payment attempts', 429)
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return mobileValidationError('Invalid payment request')

  const result = await initiateMobileTourBookingPayment({
    tourBookingId,
    principal: guard.principal,
    provider: parsed.data.provider,
    locale: parsed.data.locale,
    origin: new URL(req.url).origin,
    callbackPath: `/${parsed.data.locale}/tours/bookings/${tourBookingId}`,
    app: 'customer-web',
  })
  if (!result.ok)
    return 'dto' in result
      ? mobileError(result.code, result.code, 409, { payment: result.dto })
      : mobileErrorFromCode(
          result.code,
          'message' in result ? (result.message ?? undefined) : undefined
        )
  return Response.json(
    {
      payment: result.dto,
      reused: result.reused,
      zeroPayable: 'zeroPayable' in result ? result.zeroPayable : false,
    },
    { status: result.reused ? 200 : 201 }
  )
}
