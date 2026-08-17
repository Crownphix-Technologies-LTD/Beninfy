import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { changeCustomerPassword } from '@/lib/mobile/customerAccount'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

const schema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100),
  device: z
    .object({
      deviceId: z.string().trim().max(120).optional(),
      platform: z.string().trim().max(40).optional(),
      deviceName: z.string().trim().max(120).optional(),
      appVersion: z.string().trim().max(40).optional(),
    })
    .optional(),
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
    return mobileValidationError('Invalid password change request', parsed.error.flatten())

  const result = await changeCustomerPassword({
    principal: guard.principal,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
    device: parsed.data.device ?? {},
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    ok: true,
    session: {
      replaced: true,
      otherSessionsRevoked: true,
    },
    user: toCustomerProfileDto(result.user),
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    tokenType: result.tokens.tokenType,
    expiresIn: result.tokens.expiresIn,
  })
}
