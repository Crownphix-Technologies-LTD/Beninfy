import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { toCustomerProfileDto, toDriverProfileDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  return Response.json({
    principal: guard.principal,
    user: toCustomerProfileDto(guard.user),
    driver: guard.user.driver ? toDriverProfileDto(guard.user.driver) : null,
  })
}
