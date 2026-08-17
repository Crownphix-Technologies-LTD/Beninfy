import { getPublicTours } from '@/lib/tourCatalog'
import { mobileErrorFromCode } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params
  const tours = await getPublicTours()
  const tour = tours.find((item) => item.id === tourId)
  if (!tour) return mobileErrorFromCode('TOUR_NOT_FOUND')

  return Response.json(
    { tour },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' } }
  )
}
