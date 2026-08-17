import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { toPaymentHistoryDto, toPaymentResolutionDto } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })
  const { paymentId } = await params

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, booking: { userId: guard.principal.userId } },
    include: {
      booking: {
        select: {
          id: true,
          from: true,
          to: true,
          date: true,
          returnDate: true,
          tripType: true,
          status: true,
        },
      },
      resolution: true,
    },
  })
  if (!payment) return mobileErrorFromCode('PAYMENT_NOT_FOUND')

  return Response.json({
    payment: toPaymentHistoryDto(payment),
    paymentResolution: payment.resolution ? toPaymentResolutionDto(payment.resolution) : null,
  })
}
