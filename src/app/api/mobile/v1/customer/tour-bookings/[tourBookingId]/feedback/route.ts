import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { checkRateLimit } from '@/lib/rateLimit'
import { getCustomerTourFeedback, submitCustomerTourFeedback } from '@/lib/mobile/tourFeedback'

export const runtime = 'nodejs'
type Context = { params: Promise<{ tourBookingId: string }> }

async function guardRequest(req: Request, write: boolean) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok)
    return { ok: false as const, response: mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED') }
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return {
      ok: false as const,
      response: mobileError(onboarding.code, 'Complete account onboarding to continue', 403),
    }
  const limit = await checkRateLimit({
    scope: write ? 'mobile-tour-feedback-write' : 'mobile-tour-feedback-read',
    identifier: guard.principal.userId,
    limit: write ? 10 : 60,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return {
      ok: false as const,
      response: mobileError('RATE_LIMITED', 'Too many feedback requests', 429, {
        retryAfter: limit.retryAfter,
      }),
    }
  return { ok: true as const, principal: guard.principal }
}

export async function GET(req: Request, { params }: Context) {
  const guard = await guardRequest(req, false)
  if (!guard.ok) return guard.response
  const { tourBookingId } = await params
  const result = await getCustomerTourFeedback({ principal: guard.principal, tourBookingId })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json(
    { feedback: result.feedback },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export async function POST(req: Request, { params }: Context) {
  const guard = await guardRequest(req, true)
  if (!guard.ok) return guard.response
  const { tourBookingId } = await params
  const result = await submitCustomerTourFeedback({
    principal: guard.principal,
    tourBookingId,
    body: await req.json().catch(() => null),
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json(
    { submission: result.submission },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
  )
}
