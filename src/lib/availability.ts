import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { NON_BLOCKING_LEG_STATUSES } from '@/lib/tripLifecycle'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

function dayWindow(date: Date) {
  const startsAt = new Date(date)
  startsAt.setHours(0, 0, 0, 0)
  const endsAt = new Date(date)
  endsAt.setHours(23, 59, 59, 999)
  return { startsAt, endsAt }
}

export async function getAvailableFleetVehicleCount(
  vehicleId: string,
  departureDate: Date,
  client: PrismaClientLike = prisma
) {
  const { startsAt, endsAt } = dayWindow(departureDate)
  const physicalFleetCount = await client.fleetVehicle.count({ where: { vehicleId } })

  if (physicalFleetCount === 0) {
    return { physicalFleetCount, availableCount: 0 }
  }

  const availableAssignedUnitCount = await client.fleetVehicle.count({
    where: {
      vehicleId,
      status: 'available',
      blocks: {
        none: {
          startsAt: { lte: endsAt },
          endsAt: { gte: startsAt },
        },
      },
      bookingLegs: {
        none: {
          departureDate: { gte: startsAt, lte: endsAt },
          status: { notIn: NON_BLOCKING_LEG_STATUSES },
        },
      },
    },
  })

  const unassignedActiveBookingCount = await client.bookingLeg.count({
    where: {
      vehicleId,
      fleetVehicleId: null,
      departureDate: { gte: startsAt, lte: endsAt },
      status: { notIn: NON_BLOCKING_LEG_STATUSES },
    },
  })
  const availableCount = Math.max(0, availableAssignedUnitCount - unassignedActiveBookingCount)

  return { physicalFleetCount, availableCount }
}

export async function findAvailableFleetVehicle(
  vehicleId: string,
  departureDate: Date,
  client: PrismaClientLike = prisma
) {
  const availability = await getAvailableFleetVehicleCount(vehicleId, departureDate, client)
  if (availability.availableCount < 1) return null

  const { startsAt, endsAt } = dayWindow(departureDate)
  return client.fleetVehicle.findFirst({
    where: {
      vehicleId,
      status: 'available',
      blocks: {
        none: {
          startsAt: { lte: endsAt },
          endsAt: { gte: startsAt },
        },
      },
      bookingLegs: {
        none: {
          departureDate: { gte: startsAt, lte: endsAt },
          status: { notIn: NON_BLOCKING_LEG_STATUSES },
        },
      },
    },
    orderBy: { label: 'asc' },
    select: { id: true, label: true },
  })
}

export async function assertFleetVehicleAvailable(
  fleetVehicleId: string,
  vehicleId: string,
  dates: Date[],
  client: PrismaClientLike = prisma
) {
  const fleetVehicle = await client.fleetVehicle.findUnique({
    where: { id: fleetVehicleId },
    select: { id: true, vehicleId: true, label: true, status: true },
  })

  if (!fleetVehicle || fleetVehicle.vehicleId !== vehicleId) {
    return {
      ok: false as const,
      status: 400,
      error: 'Selected fleet unit does not belong to this vehicle category.',
    }
  }

  if (fleetVehicle.status !== 'available') {
    return {
      ok: false as const,
      status: 409,
      error: `${fleetVehicle.label} is not available for booking.`,
    }
  }

  for (const date of dates) {
    const { startsAt, endsAt } = dayWindow(date)
    const blocked = await client.vehicleBlock.count({
      where: {
        fleetVehicleId,
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
      },
    })
    if (blocked > 0) {
      return {
        ok: false as const,
        status: 409,
        error: `${fleetVehicle.label} is blocked on ${date.toISOString().slice(0, 10)}.`,
      }
    }

    const booked = await client.bookingLeg.count({
      where: {
        fleetVehicleId,
        departureDate: { gte: startsAt, lte: endsAt },
        status: { notIn: NON_BLOCKING_LEG_STATUSES },
      },
    })
    if (booked > 0) {
      return {
        ok: false as const,
        status: 409,
        error: `${fleetVehicle.label} is already booked on ${date.toISOString().slice(0, 10)}.`,
      }
    }
  }

  return { ok: true as const, fleetVehicle }
}

export async function assertVehicleTypeAvailable(
  vehicleId: string,
  dates: Date[],
  client: PrismaClientLike = prisma
) {
  const vehicle = await client.vehicle.findUnique({ where: { id: vehicleId } })
  if (!vehicle) return { ok: false as const, status: 404, error: 'Vehicle not found' }
  if (!vehicle.available)
    return { ok: false as const, status: 409, error: 'Vehicle type is unavailable for booking' }

  for (const date of dates) {
    const availability = await getAvailableFleetVehicleCount(vehicleId, date, client)
    if (availability.availableCount < 1) {
      return {
        ok: false as const,
        status: 409,
        error: `All ${vehicle.name} units are booked on ${date.toISOString().slice(0, 10)}. Please choose another vehicle or date.`,
      }
    }
  }

  return { ok: true as const, vehicle }
}
