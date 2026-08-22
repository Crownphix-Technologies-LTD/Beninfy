import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { toCustomerProfileDto, toDriverProfileDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const profile = toCustomerProfileDto(guard.user)
  return Response.json({
    principal: guard.principal,
    user: profile,
    onboarding: guard.principal.type === 'CUSTOMER' ? profile.onboarding : null,
    driver: guard.user.driver
      ? toDriverProfileDto({ ...guard.user.driver, image: guard.user.image })
      : null,
  })
}
