import { mobileRouteDetail } from '@/lib/mobile/bookingDiscovery'
import { mobileErrorFromCode } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params
  const route = await mobileRouteDetail(routeId)
  if (!route) return mobileErrorFromCode('ROUTE_NOT_FOUND')

  return Response.json({ route })
}
