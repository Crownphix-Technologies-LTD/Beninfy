import { mobileRoutesCatalogue } from '@/lib/mobile/bookingDiscovery'

export const runtime = 'nodejs'

export async function GET() {
  return Response.json(await mobileRoutesCatalogue())
}
