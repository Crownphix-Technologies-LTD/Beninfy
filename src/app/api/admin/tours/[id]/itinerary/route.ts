import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import {
  adminTourItineraryResponse,
  findAdminTourItinerary,
  saveAdminTourItinerary,
} from '@/lib/admin/tourItinerary'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params
  const tour = await findAdminTourItinerary(id)
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 })
  return NextResponse.json(adminTourItineraryResponse(tour))
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params
  const result = await saveAdminTourItinerary(id, await req.json().catch(() => null))
  if (!result.ok) return NextResponse.json(result, { status: result.status })
  const { tour, response } = result
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'update_itinerary',
    entityType: 'tour',
    entityId: id,
    metadata: {
      title: tour.title,
      dayCount: tour.itineraryDays.length,
      stopCount: tour.itineraryDays.reduce((sum, day) => sum + day.stops.length, 0),
      executionReady: response.executionReady,
    },
  })
  return NextResponse.json(response)
}
