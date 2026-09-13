import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { listDriverTourDays } from '@/lib/mobile/tourExecution'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const url = new URL(req.url)
  const result = await listDriverTourDays(guard.principal, url.searchParams.get('view'))
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    view: result.view,
    tours: result.tours,
  })
}
