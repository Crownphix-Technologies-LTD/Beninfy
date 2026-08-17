import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { toPaymentHistoryDto } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

function iso(value: Date | null) {
  return value ? value.toISOString() : null
}

function displayReference(id: string) {
  return `BFY-${id.slice(-8).toUpperCase()}`
}

export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })
  const { bookingId } = await params

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: guard.principal.userId },
    include: {
      vehicle: { select: { id: true, name: true, capacity: true } },
      payments: {
        orderBy: { createdAt: 'desc' },
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
      },
    },
  })
  if (!booking) return mobileErrorFromCode('BOOKING_NOT_FOUND')

  const amountPaidNGN = booking.payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + payment.amountNGN, 0)
  const balanceDueNGN = Math.max(booking.priceNGN - amountPaidNGN, 0)

  return Response.json({
    receipt: {
      bookingId: booking.id,
      bookingReference: displayReference(booking.id),
      issuedAt: new Date().toISOString(),
      customer: {
        name: booking.passengerName,
        email: booking.passengerEmail,
        phone: booking.passengerPhone,
      },
      trip: {
        from: booking.from,
        to: booking.to,
        date: iso(booking.date),
        returnDate: iso(booking.returnDate),
        tripType: booking.tripType,
        passengers: booking.passengers,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        vehicle: booking.vehicle,
      },
      totals: {
        currencyCode: 'NGN',
        bookingTotalNGN: booking.priceNGN,
        discountNGN: booking.discountNGN,
        amountPaidNGN,
        balanceDueNGN,
        taxNGN: null,
      },
      coupon: booking.couponCode ? { code: booking.couponCode } : null,
      payments: booking.payments.map(toPaymentHistoryDto),
      notes: {
        tax: 'No VAT or tax component is stored separately for this booking.',
        fareBreakdown:
          'Receipt totals are generated from authoritative booking and payment records only.',
      },
    },
  })
}
