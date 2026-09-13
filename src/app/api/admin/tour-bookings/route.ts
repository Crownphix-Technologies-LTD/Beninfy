import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin'
import { listAdminTourBookings } from '@/lib/mobile/tourBookings'

export const runtime = 'nodejs'

export async function GET() {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response

  const tourBookings = await listAdminTourBookings()
  return NextResponse.json({ tourBookings })
}
