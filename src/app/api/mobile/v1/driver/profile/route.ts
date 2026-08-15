import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { toDriverProfileDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.user.driver) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  return Response.json({ driver: toDriverProfileDto(guard.user.driver) })
}
