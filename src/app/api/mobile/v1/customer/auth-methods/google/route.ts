import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { linkGoogleToCustomer } from '@/lib/mobile/googleAuth'
import { checkRateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const schema = z.object({
  idToken: z.string().trim().min(20).max(12000),
  currentPassword: z.string().min(1).max(100),
})

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-google-link',
    identifier: `${guard.principal.userId}:${guard.principal.sessionId}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many Google linking attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return mobileValidationError('Invalid Google linking payload', parsed.error.flatten())
  }

  const result = await linkGoogleToCustomer({
    principal: guard.principal,
    idToken: parsed.data.idToken,
    currentPassword: parsed.data.currentPassword,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    linked: true,
    alreadyLinked: result.alreadyLinked,
    provider: 'google',
    user: toCustomerProfileDto(result.user),
  })
}
