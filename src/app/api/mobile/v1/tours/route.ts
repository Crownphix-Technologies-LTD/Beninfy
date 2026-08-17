import { getPublicTours } from '@/lib/tourCatalog'

export const runtime = 'nodejs'

export async function GET() {
  const tours = await getPublicTours()
  return Response.json(
    { tours },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' } }
  )
}
