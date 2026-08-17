import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { emailChangePolicy, requestCustomerEmailChange } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

const schema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().email().max(254),
  locale: z.enum(['en', 'fr']).optional(),
})

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid email change payload', parsed.error.flatten())

  const result = await requestCustomerEmailChange({
    principal: guard.principal,
    currentPassword: parsed.data.currentPassword,
    newEmail: parsed.data.newEmail,
    locale: parsed.data.locale,
  })
  if (!result.ok) {
    if (result.code === 'OTP_RESEND_TOO_SOON') {
      return mobileError('OTP_RESEND_TOO_SOON', 'Please wait before requesting another code', 429, {
        expiresAt: result.expiresAt,
        resendAvailableAt: result.resendAvailableAt,
      })
    }
    return mobileErrorFromCode(result.code)
  }

  return Response.json({
    emailChange: {
      verificationId: result.verificationId,
      targetEmail: parsed.data.newEmail.trim().toLowerCase(),
      expiresAt: result.expiresAt,
      resendAvailableAt: result.resendAvailableAt,
      policy: emailChangePolicy(),
    },
  })
}
