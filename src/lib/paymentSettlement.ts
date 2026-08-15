import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ACTIVE_BLOCKING_LEG_STATUSES } from '@/lib/tripLifecycle'

function dayWindow(date: Date) {
  const startsAt = new Date(date)
  startsAt.setHours(0, 0, 0, 0)
  const endsAt = new Date(date)
  endsAt.setHours(23, 59, 59, 999)
  return { startsAt, endsAt }
}

export async function markPaymentPaidAndReserveBooking({
  paymentId,
  bookingId,
  paymentData,
}: {
  paymentId: string
  bookingId: string
  paymentData: Prisma.PaymentUpdateInput
}) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          select: { status: true },
        })
        if (!payment) {
          throw new Error('Payment not found during payment settlement')
        }

        const booking = await tx.booking.findUnique({
          where: { id: bookingId },
          select: {
            id: true,
            status: true,
            paymentId: true,
            legs: {
              where: { status: 'payment_pending' },
              select: {
                id: true,
                direction: true,
                departureDate: true,
                fleetVehicleId: true,
                fleetVehicle: { select: { label: true } },
              },
            },
          },
        })

        if (!booking) {
          throw new Error('Booking not found during payment settlement')
        }

        if (booking.status === 'ops_review') {
          await tx.payment.update({
            where: { id: paymentId },
            data: {
              ...paymentData,
              status: 'paid',
            },
          })
          return {
            ok: false as const,
            status: 'availability_conflict' as const,
            message: 'Booking is already queued for operations review.',
          }
        }

        if (
          booking.legs.length === 0 &&
          (booking.status === 'confirmed' || booking.status === 'completed')
        ) {
          await tx.payment.update({
            where: { id: paymentId },
            data: {
              ...paymentData,
              status: 'paid',
            },
          })
          return {
            ok: true as const,
            status: 'confirmed' as const,
            alreadySettled: payment.status === 'paid',
          }
        }

        for (const leg of booking.legs) {
          if (!leg.fleetVehicleId) continue

          const { startsAt, endsAt } = dayWindow(leg.departureDate)
          const conflictingLeg = await tx.bookingLeg.findFirst({
            where: {
              id: { not: leg.id },
              bookingId: { not: bookingId },
              fleetVehicleId: leg.fleetVehicleId,
              departureDate: { gte: startsAt, lte: endsAt },
              status: { in: ACTIVE_BLOCKING_LEG_STATUSES },
            },
            select: { id: true },
          })
          const blocked = await tx.vehicleBlock.findFirst({
            where: {
              fleetVehicleId: leg.fleetVehicleId,
              startsAt: { lte: endsAt },
              endsAt: { gte: startsAt },
            },
            select: { id: true },
          })

          if (conflictingLeg || blocked) {
            await tx.payment.update({
              where: { id: paymentId },
              data: {
                ...paymentData,
                status: 'paid',
              },
            })
            await tx.booking.update({
              where: { id: bookingId },
              data: {
                status: 'ops_review',
                paymentId,
              },
            })

            return {
              ok: false as const,
              status: 'availability_conflict' as const,
              message: `${leg.fleetVehicle?.label ?? 'Selected fleet unit'} is no longer available for the ${leg.direction} leg.`,
            }
          }
        }

        await tx.payment.update({
          where: { id: paymentId },
          data: {
            ...paymentData,
            status: 'paid',
          },
        })
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: 'confirmed',
            paymentId,
            legs: {
              updateMany: {
                where: { status: 'payment_pending' },
                data: { status: 'reserved' },
              },
            },
          },
        })

        return {
          ok: true as const,
          status: 'confirmed' as const,
          alreadySettled: payment.status === 'paid',
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    ) {
      await prisma.$transaction([
        prisma.payment.update({
          where: { id: paymentId },
          data: {
            ...paymentData,
            status: 'paid',
          },
        }),
        prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'ops_review',
            paymentId,
          },
        }),
      ])
      return {
        ok: false as const,
        status: 'availability_conflict' as const,
        message:
          'Fleet availability changed while confirming payment. Operations will review this booking.',
      }
    }
    throw error
  }
}

export function failBookingPayment(bookingId: string) {
  const now = new Date()
  return prisma.$transaction([
    prisma.booking.updateMany({
      where: {
        id: bookingId,
        status: 'pending',
      },
      data: {
        status: 'cancelled',
      },
    }),
    prisma.bookingLeg.updateMany({
      where: {
        bookingId,
        status: 'payment_pending',
      },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: 'system',
      },
    }),
  ])
}
