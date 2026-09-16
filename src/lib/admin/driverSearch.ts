import { prisma } from '@/lib/prisma'
import { DRIVER_SEARCH_ELIGIBLE_LEG_STATUSES } from '@/lib/driverAssignmentStatus'

export async function changeDriverSearch(
  bookingLegId: string,
  action: 'start' | 'stop',
  client = prisma
) {
  return client.$transaction(async (tx) => {
    const leg = await tx.bookingLeg.findUnique({
      where: { id: bookingLegId },
      select: { bookingId: true },
    })
    if (!leg) return { ok: false as const, status: 404, error: 'Booking leg not found' }

    // Lock parent before leg, matching nested booking updates. This serializes
    // search start with booking confirmation, operational holds and cancellation.
    const bookings = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "Booking" WHERE "id" = ${leg.bookingId} FOR UPDATE
    `
    if (action === 'start' && bookings[0]?.status !== 'confirmed') {
      return { ok: false as const, status: 409, error: 'Booking is not ready for driver search' }
    }

    // The guarded UPDATE rechecks the driver after concurrent assignment commits.
    // If search wins first, assignment clears search when it attaches the driver.
    const changed = await tx.bookingLeg.updateMany({
      where: {
        id: bookingLegId,
        ...(action === 'start'
          ? { driverId: null, status: { in: DRIVER_SEARCH_ELIGIBLE_LEG_STATUSES } }
          : {}),
      },
      data: { driverSearchStatus: action === 'start' ? 'searching' : 'idle' },
    })
    if (!changed.count) {
      return { ok: false as const, status: 409, error: 'Leg is not eligible for driver search' }
    }
    const bookingLeg = await tx.bookingLeg.findUniqueOrThrow({
      where: { id: bookingLegId },
      include: { fleetVehicle: true, driver: true },
    })
    return { ok: true as const, bookingLeg }
  })
}
