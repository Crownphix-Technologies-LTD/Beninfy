import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { getDriverTourDay } from '@/lib/mobile/tourExecution'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tourBookingDayId: string }> }
) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const { tourBookingDayId } = await params
  const result = await getDriverTourDay(guard.principal, tourBookingDayId)
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({ tour: result.dto })
}
