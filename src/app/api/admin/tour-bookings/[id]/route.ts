import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin'
import { getAdminTourBooking } from '@/lib/mobile/tourBookings'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response

  const { id } = await params
  const tourBooking = await getAdminTourBooking(id)
  if (!tourBooking) return NextResponse.json({ error: 'Tour booking not found' }, { status: 404 })

  return NextResponse.json({ tourBooking })
}
