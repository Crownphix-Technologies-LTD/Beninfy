import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { applyDriverTripAction, isDriverTripAction } from '@/lib/mobile/tripTransitions'

export const runtime = 'nodejs'

const schema = z.object({
  action: z.enum(['accept', 'dispatch', 'complete', 'cancel']),
})

export async function POST(req: Request, { params }: { params: Promise<{ bookingLegId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { bookingLegId } = await params

  const rateLimit = await checkRateLimit({
    scope: 'mobile-driver-trip-action',
    identifier: `${guard.principal.userId}:${bookingLegId}:${requestIp(req)}`,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many trip action attempts', 429, { retryAfter: rateLimit.retryAfter })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success || !isDriverTripAction(parsed.data.action)) {
    return mobileValidationError('Invalid trip action', parsed.success ? undefined : parsed.error.flatten())
  }

  const result = await applyDriverTripAction({
    req,
    principal: guard.principal,
    bookingLegId,
    action: parsed.data.action,
  })
  if (!result.ok) return mobileErrorFromCode(result.code, result.message)

  return Response.json({
    ok: true,
    bookingLegId,
    previousStatus: result.previousStatus,
    status: result.nextStatus,
  })
}
