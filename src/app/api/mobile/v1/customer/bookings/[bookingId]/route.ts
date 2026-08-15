import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { toCustomerBookingDetailDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { bookingId } = await params

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: guard.principal.userId },
    include: {
      legs: { include: { fleetVehicle: true, driver: true }, orderBy: { departureDate: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!booking) return mobileErrorFromCode('BOOKING_NOT_FOUND')

  return Response.json({ booking: toCustomerBookingDetailDto(booking) })
}
