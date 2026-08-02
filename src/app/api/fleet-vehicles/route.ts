import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getFleetVehicleDisplayLabel } from '@/lib/fleetDisplay'

const ACTIVE_LEG_STATUSES = ['cancelled', 'completed']

function parseTripDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dayWindow(date: Date) {
  const startsAt = new Date(date)
  startsAt.setHours(0, 0, 0, 0)
  const endsAt = new Date(date)
  endsAt.setHours(23, 59, 59, 999)
  return { startsAt, endsAt }
}

function availabilityFilter(date: Date): Prisma.FleetVehicleWhereInput {
  const { startsAt, endsAt } = dayWindow(date)

  return {
    blocks: {
      none: {
        startsAt: { lte: endsAt },
        endsAt: { gte: startsAt },
      },
    },
    bookingLegs: {
      none: {
        departureDate: { gte: startsAt, lte: endsAt },
        status: { notIn: ACTIVE_LEG_STATUSES },
      },
    },
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicleId') || undefined
  const departureDateParam = searchParams.get('date')
  const returnDateParam = searchParams.get('returnDate')
  const departureDate = parseTripDate(departureDateParam)
  const returnDate = parseTripDate(returnDateParam)

  if (departureDateParam && !departureDate) {
    return NextResponse.json({ error: 'Invalid departure date' }, { status: 400 })
  }

  if (returnDateParam && !returnDate) {
    return NextResponse.json({ error: 'Invalid return date' }, { status: 400 })
  }

  const datesToCheck = [departureDate, returnDate].filter(Boolean) as Date[]
  const where: Prisma.FleetVehicleWhereInput = {
    status: 'available',
    ...(vehicleId ? { vehicleId } : {}),
  }

  if (datesToCheck.length > 0) {
    where.AND = datesToCheck.map(availabilityFilter)
  }

  const fleetVehicles = await prisma.fleetVehicle.findMany({
    where,
    orderBy: [{ vehicleId: 'asc' }, { label: 'asc' }],
    select: {
      id: true,
      vehicleId: true,
      label: true,
      color: true,
      currentCity: true,
      vehicle: {
        select: {
          id: true,
          name: true,
          image: true,
          capacity: true,
          luggageCapacity: true,
          description: true,
          features: true,
        },
      },
    },
  })
  let visibleFleetVehicles = fleetVehicles

  if (datesToCheck.length > 0) {
    const unassignedBookingsByVehicle = new Map<string, number>()

    for (const dateToCheck of datesToCheck) {
      const { startsAt, endsAt } = dayWindow(dateToCheck)
      const unassignedBookingCounts = await prisma.bookingLeg.groupBy({
        by: ['vehicleId'],
        where: {
          fleetVehicleId: null,
          departureDate: { gte: startsAt, lte: endsAt },
          status: { notIn: ACTIVE_LEG_STATUSES },
          ...(vehicleId ? { vehicleId } : {}),
        },
        _count: { _all: true },
      })

      for (const count of unassignedBookingCounts) {
        const currentCount = unassignedBookingsByVehicle.get(count.vehicleId) ?? 0
        unassignedBookingsByVehicle.set(count.vehicleId, Math.max(currentCount, count._count._all))
      }
    }

    const consumedByVehicle = new Map<string, number>()
    visibleFleetVehicles = fleetVehicles.filter((unit) => {
      const consumedCount = consumedByVehicle.get(unit.vehicleId) ?? 0
      const unassignedCount = unassignedBookingsByVehicle.get(unit.vehicleId) ?? 0

      if (consumedCount < unassignedCount) {
        consumedByVehicle.set(unit.vehicleId, consumedCount + 1)
        return false
      }

      return true
    })
  }

  return NextResponse.json(
    {
      fleetVehicles: visibleFleetVehicles.map((unit) => ({
        ...unit,
        displayLabel: getFleetVehicleDisplayLabel(unit.label),
      })),
    },
    {
      headers: {
        'Cache-Control': datesToCheck.length > 0 ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=600',
      },
    }
  )
}
