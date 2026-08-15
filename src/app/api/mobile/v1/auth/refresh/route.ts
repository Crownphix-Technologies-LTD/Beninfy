import { z } from 'zod'
import { refreshMobileTokens } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const schema = z.object({
  refreshToken: z.string().min(20),
})

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit({
    scope: 'mobile-refresh',
    identifier: requestIp(req),
    limit: 60,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many refresh attempts', 429, { retryAfter: rateLimit.retryAfter })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid input', parsed.error.flatten())

  const result = await refreshMobileTokens(parsed.data.refreshToken)
  if (!result.ok) return mobileErrorFromCode(result.code ?? 'UNAUTHENTICATED')

  return Response.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    tokenType: result.tokenType,
    expiresIn: result.expiresIn,
  })
}
