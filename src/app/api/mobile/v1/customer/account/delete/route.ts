import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { accountDeleteConfirmation, deleteCustomerAccount } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

const schema = z.object({
  currentPassword: z.string().min(1),
  confirmation: z.literal(accountDeleteConfirmation()),
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
  if (!parsed.success) {
    return mobileValidationError('Invalid account deletion payload', parsed.error.flatten())
  }

  const result = await deleteCustomerAccount({
    principal: guard.principal,
    currentPassword: parsed.data.currentPassword,
    confirmation: parsed.data.confirmation,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({ deleted: true, disabledAt: result.disabledAt, sessionsRevoked: true })
}
