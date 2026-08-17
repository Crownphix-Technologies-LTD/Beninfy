import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { toPaymentHistoryDto } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

const STATUS_MAP: Record<string, string[] | undefined> = {
  all: undefined,
  paid: ['paid'],
  pending: ['pending'],
  failed: ['failed', 'cancelled', 'expired', 'amount_mismatch'],
}

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'all'
  if (!(status in STATUS_MAP)) return mobileValidationError('Invalid payment status filter')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20), 1), 50)
  const cursor = url.searchParams.get('cursor')

  const payments = await prisma.payment.findMany({
    where: {
      booking: { userId: guard.principal.userId },
      ...(STATUS_MAP[status] ? { status: { in: STATUS_MAP[status] } } : {}),
    },
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
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const hasMore = payments.length > limit
  const page = hasMore ? payments.slice(0, limit) : payments

  return Response.json({
    payments: page.map(toPaymentHistoryDto),
    pageInfo: { hasMore, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null },
  })
}
