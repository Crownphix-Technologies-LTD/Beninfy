import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { toPaymentResolutionDto } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })
  const { bookingId } = await params

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: guard.principal.userId },
    select: { id: true },
  })
  if (!booking) return mobileErrorFromCode('BOOKING_NOT_FOUND')

  const resolutions = await prisma.paymentResolution.findMany({
    where: { bookingId, customerId: guard.principal.userId },
    orderBy: { createdAt: 'desc' },
  })
  if (resolutions.length === 0) return mobileErrorFromCode('PAYMENT_RESOLUTION_NOT_FOUND')

  return Response.json({ paymentResolutions: resolutions.map(toPaymentResolutionDto) })
}
