import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { verifyMobileBookingPayment } from '@/lib/mobile/payments'

export const runtime = 'nodejs'

const verifySchema = z.object({
  reference: z.string().trim().min(1).max(100).optional(),
  providerReference: z.string().trim().min(1).max(160).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { bookingId } = await params

  const rateLimit = await checkRateLimit({
    scope: 'mobile-payment-verify',
    identifier: `${guard.principal.userId}:${bookingId}:${requestIp(req)}`,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many payment verification attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = verifySchema.safeParse(body ?? {})
  if (!parsed.success)
    return mobileValidationError('Invalid verification request', parsed.error.flatten())

  const result = await verifyMobileBookingPayment({
    bookingId,
    principal: guard.principal,
    reference: parsed.data.reference,
    providerReference: parsed.data.providerReference,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({ payment: result.dto })
}
