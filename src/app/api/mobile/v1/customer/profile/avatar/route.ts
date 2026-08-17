import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { uploadCustomerAvatar } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return mobileErrorFromCode('AVATAR_INVALID')

  const result = await uploadCustomerAvatar({ principal: guard.principal, file })
  if (!result.ok) return mobileErrorFromCode(result.code, result.message)

  return Response.json({ avatarUrl: result.avatarUrl })
}
