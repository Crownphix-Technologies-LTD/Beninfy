import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  DRIVER_TOUR_ACTIONS,
  applyDriverTourAction,
  isDriverTourAction,
} from '@/lib/mobile/tourExecution'

export const runtime = 'nodejs'

const schema = z.object({
  action: z.enum(DRIVER_TOUR_ACTIONS),
  stopId: z.string().trim().min(1).max(120).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tourBookingDayId: string }> }
) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { tourBookingDayId } = await params

  const rateLimit = await checkRateLimit({
    scope: 'mobile-driver-tour-action',
    identifier: `${guard.principal.userId}:${tourBookingDayId}:${requestIp(req)}`,
    limit: 24,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many tour action attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success || !isDriverTourAction(parsed.data.action)) {
    return mobileValidationError(
      'Invalid tour action',
      parsed.success ? undefined : parsed.error.flatten()
    )
  }

  const result = await applyDriverTourAction({
    req,
    principal: guard.principal,
    tourBookingDayId,
    action: parsed.data.action,
    stopId: parsed.data.stopId,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    ok: true,
    tour: result.dto,
    idempotent: result.idempotent,
  })
}
