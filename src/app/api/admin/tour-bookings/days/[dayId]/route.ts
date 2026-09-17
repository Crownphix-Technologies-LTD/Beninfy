import { NextResponse } from 'next/server'
import { z } from 'zod'
import { tourPickupSchema } from '@/lib/mobile/tourPickup'
import { requireAdminPermission } from '@/lib/admin'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { assignTourBookingDay } from '@/lib/mobile/tourExecution'

export const runtime = 'nodejs'

const schema = z.object({
  pickup: tourPickupSchema.optional(),
  driverId: z.string().nullable().optional(),
  fleetVehicleId: z.string().nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ dayId: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { dayId } = await params
  const result = await assignTourBookingDay({
    tourBookingDayId: dayId,
    driverId: parsed.data.driverId,
    fleetVehicleId: parsed.data.fleetVehicleId,
    pickup: parsed.data.pickup,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return NextResponse.json({ tour: result.dto })
}
