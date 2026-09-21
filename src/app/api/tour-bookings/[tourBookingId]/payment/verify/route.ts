import { z } from 'zod'
import { mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  getMobileTourBookingPayment,
  verifyMobileTourBookingPayment,
} from '@/lib/mobile/tourPayments'
import { requireWebCustomer } from '@/lib/webCustomer'

export const runtime = 'nodejs'
const schema = z.object({
  reference: z.string().trim().max(160).optional(),
  providerReference: z.string().trim().max(200).optional(),
})
type Context = { params: Promise<{ tourBookingId: string }> }

export async function POST(req: Request, { params }: Context) {
  const guard = await requireWebCustomer()
  if (!guard.ok) return mobileErrorFromCode(guard.code)
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return mobileValidationError('Invalid payment verification request')
  const { tourBookingId } = await params
  const result = await verifyMobileTourBookingPayment({
    tourBookingId,
    principal: guard.principal,
    reference: parsed.data.reference,
    providerReference: parsed.data.providerReference,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  const current = await getMobileTourBookingPayment({
    principal: guard.principal,
    tourBookingId,
  })
  if (!current.ok) return mobileErrorFromCode(current.code)
  return Response.json({ payment: current.dto, tourBooking: current.tourBooking })
}
