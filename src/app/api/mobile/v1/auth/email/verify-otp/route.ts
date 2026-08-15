import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { verifyCustomerEmailOtp } from '@/lib/mobile/onboarding'

export const runtime = 'nodejs'

const schema = z.object({
  verificationId: z.string().trim().min(1),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
})

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-email-otp-verify',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 12,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('OTP_RATE_LIMITED', 'Too many verification attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid verification request', parsed.error.flatten())

  const result = await verifyCustomerEmailOtp({
    principal: guard.principal,
    verificationId: parsed.data.verificationId,
    code: parsed.data.code,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({ onboarding: result.onboarding })
}
