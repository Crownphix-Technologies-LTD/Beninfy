import { createHash } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { MobilePrincipal } from '@/lib/mobile/auth'

const comment = z.string().trim().max(2000).optional()
export const tourDriverAnswersSchema = z
  .object({
    professionalRespectful: z.boolean(),
    feltSafe: z.boolean(),
    followedAgreedService: z.enum(['yes', 'no', 'not_applicable']),
    uncomfortablePersonalQuestions: z.boolean(),
    offPlatformSolicitation: z.boolean(),
    unauthorizedPaymentRequest: z.boolean(),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict()
export const tourFeedbackSubmissionSchema = z
  .object({
    overallRating: z.number().int().min(1).max(5),
    comment,
    drivers: z.array(tourDriverAnswersSchema.extend({ targetId: z.string().length(32) })).max(30),
  })
  .strict()

export type TourDriverAnswers = z.infer<typeof tourDriverAnswersSchema>
export function tourFeedbackRiskFlags(answers: TourDriverAnswers) {
  return [
    !answers.feltSafe ? 'safety_concern' : null,
    answers.offPlatformSolicitation ? 'off_platform_solicitation' : null,
    answers.unauthorizedPaymentRequest ? 'unauthorized_payment_request' : null,
    !answers.professionalRespectful || answers.uncomfortablePersonalQuestions
      ? 'professionalism_concern'
      : null,
    answers.followedAgreedService === 'no' ? 'service_itinerary_concern' : null,
  ].filter((value): value is string => value !== null)
}

type FeedbackDay = {
  id: string
  status: string
  dayNumber: number
  scheduledDate: Date
  sourceTourId: string | null
  sourceTourTitle: string | null
  title: string
  assignedDriverId: string | null
  assignedDriver: { id: string; name: string } | null
}
export function tourFeedbackTargets(bookingId: string, days: FeedbackDay[]) {
  const groups = new Map<
    string,
    {
      targetId: string
      driverId: string
      displayName: string
      days: Array<{
        tourBookingDayId: string
        dayNumber: number
        scheduledDate: string
        sourceTourId: string | null
        tourTitle: string
      }>
    }
  >()
  for (const day of [...days].sort((a, b) => a.dayNumber - b.dayNumber)) {
    if (day.status !== 'completed' || !day.assignedDriverId || !day.assignedDriver) continue
    const driverId = day.assignedDriverId
    let group = groups.get(driverId)
    if (!group) {
      group = {
        targetId: createHash('sha256')
          .update(`${bookingId}:${driverId}`)
          .digest('hex')
          .slice(0, 32),
        driverId,
        displayName: day.assignedDriver.name,
        days: [],
      }
      groups.set(driverId, group)
    }
    group.days.push({
      tourBookingDayId: day.id,
      dayNumber: day.dayNumber,
      scheduledDate: day.scheduledDate.toISOString(),
      sourceTourId: day.sourceTourId,
      tourTitle: day.sourceTourTitle ?? day.title,
    })
  }
  return [...groups.values()]
}

export const tourFeedbackInclude = {
  drivers: {
    orderBy: { id: 'asc' as const },
    include: { days: { orderBy: { dayNumber: 'asc' as const } } },
  },
}
const bookingInclude = {
  days: {
    orderBy: { dayNumber: 'asc' as const },
    include: { assignedDriver: { select: { id: true, name: true } } },
  },
  feedback: { include: tourFeedbackInclude },
}

function customerSubmission(
  feedback: NonNullable<Awaited<ReturnType<typeof ownedFeedbackBooking>>>['feedback']
) {
  if (!feedback) return null
  return {
    id: feedback.id,
    overallRating: feedback.overallRating,
    comment: feedback.comment,
    submittedAt: feedback.submittedAt.toISOString(),
    drivers: feedback.drivers.map((d) => ({
      displayName: d.driverName,
      answers: {
        professionalRespectful: d.professionalRespectful,
        feltSafe: d.feltSafe,
        followedAgreedService: d.followedAgreedService,
        uncomfortablePersonalQuestions: d.uncomfortablePersonalQuestions,
        offPlatformSolicitation: d.offPlatformSolicitation,
        unauthorizedPaymentRequest: d.unauthorizedPaymentRequest,
        comment: d.comment,
      },
      days: d.days.map((day) => ({
        tourBookingDayId: day.tourBookingDayId,
        dayNumber: day.dayNumber,
        scheduledDate: day.scheduledDate.toISOString(),
        sourceTourId: day.sourceTourId,
        tourTitle: day.tourTitle,
      })),
    })),
  }
}

async function ownedFeedbackBooking(
  tourBookingId: string,
  principal: MobilePrincipal,
  client = prisma
) {
  return client.tourBooking.findFirst({
    where: { id: tourBookingId, userId: principal.userId },
    include: bookingInclude,
  })
}

export async function getCustomerTourFeedback(
  input: { tourBookingId: string; principal: MobilePrincipal },
  client = prisma
) {
  const booking = await ownedFeedbackBooking(input.tourBookingId, input.principal, client)
  if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as const }
  const submitted = Boolean(booking.feedback)
  const completed = booking.status === 'completed' && booking.paymentStatus === 'paid'
  return {
    ok: true as const,
    feedback: {
      eligible: completed && !submitted,
      submitted,
      reason: submitted ? 'already_submitted' : completed ? 'eligible' : 'not_completed',
      context: {
        tourBookingId: booking.id,
        reference: booking.reference,
        tourTitle: booking.tourTitle,
        selectedTourIds: booking.selectedTourIds,
        startDate: booking.startDate.toISOString(),
        endDate: booking.endDate.toISOString(),
      },
      drivers:
        completed && !submitted
          ? tourFeedbackTargets(booking.id, booking.days).map((target) => ({
              targetId: target.targetId,
              displayName: target.displayName,
              days: target.days,
            }))
          : [],
      submission: customerSubmission(booking.feedback),
    },
  }
}

export async function submitCustomerTourFeedback(
  input: { tourBookingId: string; principal: MobilePrincipal; body: unknown },
  client = prisma
) {
  const parsed = tourFeedbackSubmissionSchema.safeParse(input.body)
  if (!parsed.success) return { ok: false as const, code: 'VALIDATION_ERROR' as const }
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TourBooking" WHERE "id" = ${input.tourBookingId} FOR UPDATE`
    const booking = await ownedFeedbackBooking(
      input.tourBookingId,
      input.principal,
      tx as typeof prisma
    )
    if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as const }
    if (booking.feedback)
      return { ok: false as const, code: 'TOUR_FEEDBACK_ALREADY_SUBMITTED' as const }
    if (booking.status !== 'completed' || booking.paymentStatus !== 'paid')
      return { ok: false as const, code: 'TOUR_FEEDBACK_NOT_ALLOWED' as const }
    const targets = tourFeedbackTargets(booking.id, booking.days)
    const answers = new Map(parsed.data.drivers.map((d) => [d.targetId, d]))
    if (
      answers.size !== parsed.data.drivers.length ||
      answers.size !== targets.length ||
      targets.some((t) => !answers.has(t.targetId))
    )
      return { ok: false as const, code: 'TOUR_FEEDBACK_TARGET_INVALID' as const }
    const riskFlags = [...new Set(parsed.data.drivers.flatMap(tourFeedbackRiskFlags))]
    const feedback = await tx.tourFeedback.create({
      data: {
        tourBookingId: booking.id,
        customerId: input.principal.userId,
        overallRating: parsed.data.overallRating,
        comment: parsed.data.comment || null,
        riskFlags,
        drivers: {
          create: targets.map((target) => {
            const answer = answers.get(target.targetId)!
            return {
              driverId: target.driverId,
              driverName: target.displayName,
              professionalRespectful: answer.professionalRespectful,
              feltSafe: answer.feltSafe,
              followedAgreedService: answer.followedAgreedService,
              uncomfortablePersonalQuestions: answer.uncomfortablePersonalQuestions,
              offPlatformSolicitation: answer.offPlatformSolicitation,
              unauthorizedPaymentRequest: answer.unauthorizedPaymentRequest,
              comment: answer.comment || null,
              riskFlags: tourFeedbackRiskFlags(answer),
              days: {
                create: target.days.map((day) => ({
                  ...day,
                  scheduledDate: new Date(day.scheduledDate),
                })),
              },
            }
          }),
        },
      },
      include: tourFeedbackInclude,
    })
    return { ok: true as const, submission: customerSubmission(feedback) }
  })
}
