import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { createCustomerTourBooking, listCustomerTourBookings } from '@/lib/mobile/tourBookings'
import { requireWebCustomer } from '@/lib/webCustomer'
import { webTourBookingSchema } from '@/lib/webTourBookingContract'

export const runtime = 'nodejs'

export async function GET() {
  const guard = await requireWebCustomer()
  if (!guard.ok) return mobileErrorFromCode(guard.code)
  return Response.json({ tourBookings: await listCustomerTourBookings(guard.principal) })
}

export async function POST(req: Request) {
  const guard = await requireWebCustomer()
  if (!guard.ok) return mobileErrorFromCode(guard.code)
  const limit = await checkRateLimit({
    scope: 'web-tour-booking-create',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 6,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return mobileError('RATE_LIMITED', 'Too many Tour booking attempts', 429, {
      retryAfter: limit.retryAfter,
    })

  const parsed = webTourBookingSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return mobileValidationError('Invalid Tour booking request', parsed.error.flatten())

  const result = await createCustomerTourBooking({
    ...parsed.data,
    principal: guard.principal,
    tourId: 'bundle',
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json(
    { tourBooking: result.dto, pricingBasis: result.pricingBasis },
    { status: result.idempotent ? 200 : 201 }
  )
}
