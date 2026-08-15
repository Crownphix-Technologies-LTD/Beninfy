import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  createEmailOtpChallenge,
  normalizeMobileLocale,
  toMobileOnboardingDto,
} from '@/lib/mobile/onboarding'

export const runtime = 'nodejs'

const schema = z.object({
  locale: z.enum(['en', 'fr']).optional(),
})

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.user.phone) return mobileErrorFromCode('ONBOARDING_INCOMPLETE')
  if (!guard.user.email) return mobileErrorFromCode('UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-email-otp-resend',
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
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success)
    return mobileValidationError('Invalid resend request', parsed.error.flatten())

  const result = await createEmailOtpChallenge({
    userId: guard.principal.userId,
    email: guard.user.email,
    locale: normalizeMobileLocale(parsed.data.locale ?? guard.user.locale),
  })
  if (!result.ok) {
    return mobileError(result.code, 'Please wait before requesting another code', 429, {
      resendAvailableAt: result.resendAvailableAt,
      expiresAt: result.expiresAt,
    })
  }

  return Response.json({
    verificationId: result.verificationId,
    expiresAt: result.expiresAt,
    resendAvailableAt: result.resendAvailableAt,
    onboarding: toMobileOnboardingDto(guard.user),
  })
}
