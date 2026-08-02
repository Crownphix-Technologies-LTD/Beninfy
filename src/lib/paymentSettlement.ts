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
