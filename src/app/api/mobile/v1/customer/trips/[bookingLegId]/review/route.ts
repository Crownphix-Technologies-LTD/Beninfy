import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { REVIEW_TAGS, toTripReviewDto } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.enum(REVIEW_TAGS)).max(8).optional().default([]),
  comment: z.string().trim().max(1000).optional().nullable(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingLegId: string }> }
) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid review payload', parsed.error.flatten())
  const { bookingLegId } = await params

  const leg = await prisma.bookingLeg.findFirst({
    where: {
      id: bookingLegId,
      booking: { userId: guard.principal.userId },
    },
    select: { id: true, status: true, driverId: true },
  })
  if (!leg) return mobileErrorFromCode('TRIP_NOT_FOUND')
  if (leg.status !== 'completed' || !leg.driverId) return mobileErrorFromCode('REVIEW_NOT_ALLOWED')

  try {
    const review = await prisma.tripReview.create({
      data: {
        bookingLegId: leg.id,
        customerId: guard.principal.userId,
        driverId: leg.driverId,
        rating: parsed.data.rating,
        tags: parsed.data.tags,
        comment: parsed.data.comment || null,
      },
    })
    return Response.json({ review: toTripReviewDto(review) }, { status: 201 })
  } catch (error) {
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return mobileErrorFromCode('REVIEW_ALREADY_EXISTS')
    }
    throw error
  }
}
