import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { getCustomerTourBooking, tourPaymentFoundation } from '@/lib/mobile/tourBookings'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tourBookingId: string }> }
) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const { tourBookingId } = await params
  const result = await getCustomerTourBooking({ principal: guard.principal, tourBookingId })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    tourBookingId: result.dto.id,
    reference: result.dto.reference,
    payment: result.dto.payment,
    paymentFoundation: tourPaymentFoundation(),
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tourBookingId: string }> }
) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const { tourBookingId } = await params
  const result = await getCustomerTourBooking({ principal: guard.principal, tourBookingId })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return mobileErrorFromCode(
    'TOUR_BOOKING_NOT_PAYABLE',
    'Tour payment initialization is not available until Tour payment ownership is implemented'
  )
}
