import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ACTIVE_BLOCKING_LEG_STATUSES } from '@/lib/tripLifecycle'
import { redeemTourCoupon, expireFailedTourCoupon } from '@/lib/mobile/tourCoupons'

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
        await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`
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

        // A provider settlement received after an explicit checkout cancellation
        // remains authoritative. Keep released inventory released and move the paid
        // booking to operations review rather than leaving a paid booking cancelled.
        if (booking.status === 'cancelled') {
          await tx.payment.update({
            where: { id: paymentId },
            data: { ...paymentData, status: 'paid' },
          })
          await tx.booking.update({
            where: { id: bookingId },
            data: { status: 'ops_review', paymentId },
          })
          return {
            ok: false as const,
            status: 'availability_conflict' as const,
            message: 'Payment settled after cancellation. Operations will review this booking.',
          }
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
                legs: { updateMany: { where: {}, data: { driverSearchStatus: 'idle' } } },
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
                data: { status: 'reserved', driverSearchStatus: 'idle' },
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
            legs: { updateMany: { where: {}, data: { driverSearchStatus: 'idle' } } },
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
        driverSearchStatus: 'idle',
        cancelledAt: now,
        cancelledBy: 'system',
      },
    }),
  ])
}

export async function markPaymentPaidAndConfirmTourBooking({
  paymentId,
  tourBookingId,
  amountNGN,
  provider,
  providerReference,
  paymentData,
}: {
  paymentId: string
  tourBookingId: string
  amountNGN: number
  provider: string
  providerReference?: string | null
  paymentData: Prisma.PaymentUpdateInput
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TourBooking" WHERE "id" = ${tourBookingId} FOR UPDATE`
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { status: true },
      })
      if (!payment) {
        throw new Error('Payment not found during tour payment settlement')
      }

      const tourBooking = await tx.tourBooking.findUnique({
        where: { id: tourBookingId },
        select: { id: true, status: true, paymentStatus: true, priceNGN: true },
      })
      if (!tourBooking) {
        throw new Error('Tour booking not found during payment settlement')
      }
      if (tourBooking.priceNGN !== amountNGN) throw new Error('Tour settlement amount differs from authoritative booking')
      if (payment.status === 'paid' || tourBooking.paymentStatus === 'paid') {
        return { ok: true as const, status: 'confirmed' as const, alreadySettled: true }
      }
      await redeemTourCoupon(tourBookingId, tx)

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          ...paymentData,
          status: 'paid',
        },
      })

      if (tourBooking.status === 'cancelled') {
        await tx.tourStopExecution.updateMany({
          where: {
            tourBookingDay: { tourBookingId },
            status: 'skipped',
            skipReason: 'tour_cancelled',
          },
          data: { status: 'upcoming', skippedAt: null, skipReason: null },
        })
        await tx.tourBookingDay.updateMany({
          where: { tourBookingId, status: 'cancelled' },
          data: { status: 'upcoming', cancelledAt: null },
        })
      }

      await tx.tourBooking.update({
        where: { id: tourBookingId },
        data: {
          status: tourBooking.status === 'completed' ? 'completed' : 'confirmed',
          paymentStatus: 'paid',
          amountPaidNGN: amountNGN,
          paymentProvider: provider,
          paymentReference: providerReference,
          cancelledAt: null,
        },
      })

      return {
        ok: true as const,
        status: 'confirmed' as const,
        alreadySettled: payment.status === 'paid' || tourBooking.paymentStatus === 'paid',
      }
    },
    // Booking row lock serializes settlement and coupon/pricing mutations.
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  )
}

export async function failTourBookingPayment(tourBookingId: string) {
  const result = await prisma.tourBooking.updateMany({
    where: {
      id: tourBookingId,
      status: 'payment_pending',
    },
    data: {
      paymentStatus: 'failed',
    },
  })
  await expireFailedTourCoupon(tourBookingId)
  return result
}
