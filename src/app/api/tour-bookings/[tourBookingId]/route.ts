import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { getCustomerTourBooking } from '@/lib/mobile/tourBookings'
import { requireWebCustomer } from '@/lib/webCustomer'

export const runtime = 'nodejs'
type Context = { params: Promise<{ tourBookingId: string }> }

export async function GET(_req: Request, { params }: Context) {
  const guard = await requireWebCustomer()
  if (!guard.ok) return mobileErrorFromCode(guard.code)
  const { tourBookingId } = await params
  const result = await getCustomerTourBooking({ principal: guard.principal, tourBookingId })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({ tourBooking: result.dto })
}
