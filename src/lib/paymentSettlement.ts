import { prisma } from '@/lib/prisma'

export function reserveBookingAfterPayment(bookingId: string, paymentId: string) {
  return prisma.booking.update({
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
}

export function failBookingPayment(bookingId: string) {
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
      },
    }),
  ])
}
