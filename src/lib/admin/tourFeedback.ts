import { prisma } from '@/lib/prisma'
import { tourFeedbackInclude } from '@/lib/mobile/tourFeedback'

export async function listAdminTourFeedback(
  input: { page: number; pageSize: number; flagged?: boolean },
  client = prisma
) {
  const where = input.flagged === undefined ? {} : { riskFlags: { isEmpty: !input.flagged } }
  const [feedback, total] = await client.$transaction([
    client.tourFeedback.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        ...tourFeedbackInclude,
        customer: { select: { id: true, name: true, email: true, anonymizedAt: true } },
        tourBooking: {
          select: {
            id: true,
            reference: true,
            selectedTourIds: true,
            tourTitle: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    }),
    client.tourFeedback.count({ where }),
  ])
  return {
    feedback: feedback.map((f) => ({ ...f, reviewRequired: f.riskFlags.length > 0 })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    },
  }
}
