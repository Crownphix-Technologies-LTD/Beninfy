import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'
import { verifyCustomerEmailChange } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

const schema = z.object({
  verificationId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
  device: z
    .object({
      deviceId: z.string().optional().nullable(),
      platform: z.string().optional().nullable(),
      deviceName: z.string().optional().nullable(),
      appVersion: z.string().optional().nullable(),
    })
    .optional()
    .default({}),
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
    return mobileValidationError('Invalid email verification payload', parsed.error.flatten())

  const result = await verifyCustomerEmailChange({
    principal: guard.principal,
    verificationId: parsed.data.verificationId,
    code: parsed.data.code,
    device: parsed.data.device,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    user: toCustomerProfileDto(result.user),
    tokens: result.tokens,
    sessionInvalidated: true,
  })
}
