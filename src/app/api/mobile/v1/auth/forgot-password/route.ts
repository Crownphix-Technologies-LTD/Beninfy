import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { mobileError, mobileValidationError } from '@/lib/mobile/errors'
import { requestMobilePasswordReset } from '@/lib/mobile/onboarding'

export const runtime = 'nodejs'

const schema = z.object({
  email: z.string().trim().email(),
  principalType: z.enum(['CUSTOMER', 'DRIVER']).optional(),
  locale: z.enum(['en', 'fr']).optional(),
})

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid password reset request', parsed.error.flatten())

  const rateLimit = await checkRateLimit({
    scope: 'mobile-forgot-password',
    identifier: `${parsed.data.email.toLowerCase()}:${requestIp(req)}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many password reset requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  await requestMobilePasswordReset({
    email: parsed.data.email,
    principalType: parsed.data.principalType,
    locale: parsed.data.locale,
    origin: new URL(req.url).origin,
  })

  return Response.json({
    ok: true,
    message: 'If the account exists, a password reset email has been sent.',
  })
}
