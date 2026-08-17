import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { toTripReviewDto } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20), 1), 50)
  const cursor = url.searchParams.get('cursor')
  const reviews = await prisma.tripReview.findMany({
    where: { customerId: guard.principal.userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const hasMore = reviews.length > limit
  const page = hasMore ? reviews.slice(0, limit) : reviews

  return Response.json({
    reviews: page.map(toTripReviewDto),
    pageInfo: { hasMore, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null },
  })
}
