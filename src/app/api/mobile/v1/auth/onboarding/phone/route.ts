import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { updateCustomerPhoneAndSendEmailOtp } from '@/lib/mobile/onboarding'

export const runtime = 'nodejs'

const schema = z.object({
  phone: z.string().trim().min(4).max(30),
  locale: z.enum(['en', 'fr']).optional(),
})

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-email-otp-send',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('OTP_RATE_LIMITED', 'Too many verification code requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid phone request', parsed.error.flatten())

  const result = await updateCustomerPhoneAndSendEmailOtp({
    principal: guard.principal,
    phone: parsed.data.phone,
    locale: parsed.data.locale,
  })
  if (!result.ok) {
    return result.code === 'OTP_RESEND_TOO_SOON'
      ? mobileError(result.code, 'Please wait before requesting another code', 429, {
          resendAvailableAt: result.resendAvailableAt,
          expiresAt: result.expiresAt,
        })
      : mobileErrorFromCode(result.code)
  }

  return Response.json({
    verificationId: result.verificationId,
    expiresAt: result.expiresAt,
    resendAvailableAt: result.resendAvailableAt,
    onboarding: result.onboarding,
  })
}
