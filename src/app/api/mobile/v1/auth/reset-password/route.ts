import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { resetMobilePassword } from '@/lib/mobile/onboarding'

export const runtime = 'nodejs'

const schema = z.object({
  token: z.string().trim().min(20).max(300),
  password: z.string().min(8).max(100),
})

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit({
    scope: 'mobile-reset-password',
    identifier: requestIp(req),
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many password reset attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid password reset request', parsed.error.flatten())

  const result = await resetMobilePassword({
    token: parsed.data.token,
    password: parsed.data.password,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({ ok: true })
}
