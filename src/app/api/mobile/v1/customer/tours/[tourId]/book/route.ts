import { z } from 'zod'
import { tourPickupSchema } from '@/lib/mobile/tourPickup'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { createCustomerTourBooking } from '@/lib/mobile/tourBookings'

export const runtime = 'nodejs'

const schema = z.object({
  startDate: z.string().trim(),
  pickup: tourPickupSchema,
  travellers: z.number().int(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ tourId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const { tourId } = await params
  const rateLimit = await checkRateLimit({
    scope: 'mobile-tour-booking-create',
    identifier: `${guard.principal.userId}:${tourId}:${requestIp(req)}`,
    limit: 6,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many tour booking attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return mobileValidationError('Invalid tour booking request', parsed.error.flatten())
  }

  const result = await createCustomerTourBooking({
    principal: guard.principal,
    tourId,
    startDate: parsed.data.startDate,
    travellers: parsed.data.travellers,
    pickup: parsed.data.pickup,
    idempotencyKey: parsed.data.idempotencyKey,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  const status = result.idempotent ? 200 : 201
  return Response.json(
    {
      tourBooking: result.dto,
      pricingBasis: result.pricingBasis,
    },
    { status }
  )
}
