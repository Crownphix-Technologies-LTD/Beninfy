import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { toTripReviewDto } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })
  const { reviewId } = await params

  const review = await prisma.tripReview.findFirst({
    where: { id: reviewId, customerId: guard.principal.userId },
  })
  if (!review) return mobileErrorFromCode('REVIEW_NOT_FOUND')

  return Response.json({ review: toTripReviewDto(review) })
}
