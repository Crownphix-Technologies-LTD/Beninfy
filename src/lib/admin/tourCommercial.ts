import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { tourItinerarySchema } from '@/lib/admin/tourItineraryForm'
import {
  toTourItineraryDto,
  tourExecutionReadiness,
  validateTourItineraryTemplate,
  hasCompleteTourStopLocation,
} from '@/lib/tourItinerary'
import { validateCotonouTourPickup } from '@/lib/mobile/tourPickupTerritory'
import { CANONICAL_TOUR_IDS } from '@/lib/tourCommercial'

export async function archiveOrDeleteTour(id: string, client = prisma) {
  return client.$transaction(async (tx) => {
    const dependentBookings = await tx.tourBooking.count({
      where: {
        OR: [
          { tourId: id },
          { selectedTourIds: { has: id } },
          { days: { some: { sourceTourId: id } } },
        ],
      },
    })
    const archived =
      dependentBookings > 0 ||
      CANONICAL_TOUR_IDS.includes(id as (typeof CANONICAL_TOUR_IDS)[number])
    if (archived) await tx.tour.update({ where: { id }, data: { active: false } })
    else await tx.tour.delete({ where: { id } })
    return { archived }
  })
}

const include = {
  days: {
    orderBy: { dayNumber: 'asc' as const },
    include: { stops: { orderBy: { sortOrder: 'asc' as const } } },
  },
}

export async function findTourBookingQuote(id: string) {
  const booking = await prisma.tourBooking.findUnique({ where: { id }, include })
  if (!booking) return null
  const template = {
    itineraryDays: booking.days.map((day) => ({
      ...day,
      defaultStartLabel: day.pickupLabel,
      defaultStartAddress: day.pickupAddress,
      defaultStartLatitude: day.pickupLatitude,
      defaultStartLongitude: day.pickupLongitude,
      defaultEndLabel: day.endLabel,
      defaultEndAddress: day.endAddress,
      defaultEndLatitude: day.endLatitude,
      defaultEndLongitude: day.endLongitude,
    })),
  }
  const readiness = tourExecutionReadiness(template)
  return {
    booking,
    response: {
      tourId: booking.id,
      updatedAt: booking.updatedAt.toISOString(),
      itineraryDays: toTourItineraryDto(template),
      executionReady: readiness.executionReady,
      executionReadinessReason: readiness.reason,
    },
  }
}

export const tourOperationsQuoteSchema = tourItinerarySchema.extend({
  expectedUpdatedAt: z.iso.datetime(),
  priceNGN: z.number().int().min(1).max(20_000_000),
})

export async function approveTourOperationsQuote(id: string, body: unknown, client = prisma) {
  const parsed = tourOperationsQuoteSchema.safeParse(body)
  if (!parsed.success)
    return {
      ok: false as const,
      status: 400,
      error: 'Invalid quote',
      issues: parsed.error.flatten(),
    }
  const validated = validateTourItineraryTemplate(parsed.data.days)
  if (
    !validated.ok ||
    !parsed.data.days.length ||
    parsed.data.days.some(
      (day) => !day.stops.length || day.stops.some((stop) => !hasCompleteTourStopLocation(stop))
    )
  )
    return {
      ok: false as const,
      status: 400,
      error: 'Configure a complete execution itinerary before quoting',
    }
  for (const day of validated.days) {
    if (
      !day.defaultStartAddress ||
      !day.defaultStartLabel ||
      day.defaultStartLatitude == null ||
      day.defaultStartLongitude == null
    )
      return { ok: false as const, status: 400, error: 'Every day requires a Cotonou pickup' }
    const territory = await validateCotonouTourPickup({
      label: day.defaultStartLabel,
      address: day.defaultStartAddress,
      coordinates: { latitude: day.defaultStartLatitude, longitude: day.defaultStartLongitude },
    })
    if (!territory.ok)
      return {
        ok: false as const,
        status: territory.code === 'PLACE_SEARCH_UNAVAILABLE' ? 503 : 400,
        error: territory.code,
      }
  }
  return client.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TourBooking" WHERE id = ${id} FOR UPDATE`
      const booking = await tx.tourBooking.findUnique({
        where: { id },
        include: { ...include, payments: true },
      })
      if (!booking) return { ok: false as const, status: 404, error: 'Tour booking not found' }
      if (
        booking.status !== 'quote_pending' ||
        booking.quoteStatus !== 'pending' ||
        booking.itineraryMode !== 'custom' ||
        booking.payments.length
      )
        return { ok: false as const, status: 409, error: 'This booking cannot be quoted' }
      if (
        booking.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt ||
        booking.days.length !== validated.days.length
      )
        return { ok: false as const, status: 409, error: 'Booking changed; reload before quoting' }
      if (
        booking.days.some(
          (day) => day.status !== 'upcoming' || day.assignedDriverId || day.assignedFleetVehicleId
        )
      )
        return {
          ok: false as const,
          status: 409,
          error: 'Assigned or started days cannot be replaced',
        }
      const quotedAt = new Date()
      for (const [index, day] of validated.days.entries()) {
        const current = booking.days[index]
        // Keep source identity, dates and execution Day IDs; only Operations edits the itinerary.
        await tx.tourStopExecution.deleteMany({ where: { tourBookingDayId: current.id } })
        await tx.tourBookingDay.update({
          where: { id: current.id },
          data: {
            title: day.title,
            titleFr: day.titleFr,
            description: day.description,
            descriptionFr: day.descriptionFr,
            pickupLabel: day.defaultStartLabel,
            pickupAddress: day.defaultStartAddress,
            pickupLatitude: day.defaultStartLatitude,
            pickupLongitude: day.defaultStartLongitude,
            endLabel: day.defaultEndLabel,
            endAddress: day.defaultEndAddress,
            endLatitude: day.defaultEndLatitude,
            endLongitude: day.defaultEndLongitude,
            stops: {
              create: day.stops.filter(hasCompleteTourStopLocation).map((stop) => ({
                sortOrder: stop.sortOrder,
                title: stop.title,
                titleFr: stop.titleFr,
                description: stop.description,
                descriptionFr: stop.descriptionFr,
                address: stop.address,
                latitude: stop.latitude,
                longitude: stop.longitude,
                estimatedDurationMinutes: stop.estimatedDurationMinutes,
                required: stop.required,
              })),
            },
          },
        })
      }
      const previousSnapshot =
        booking.commercialSnapshot &&
        typeof booking.commercialSnapshot === 'object' &&
        !Array.isArray(booking.commercialSnapshot)
          ? (booking.commercialSnapshot as Prisma.JsonObject)
          : {}
      await tx.tourBooking.update({
        where: { id },
        data: {
          quoteStatus: 'approved',
          quotedAt,
          priceNGN: parsed.data.priceNGN,
          status: 'payment_pending',
          commercialSnapshot: {
            ...previousSnapshot,
            pricingBasis: 'operations_quote',
            quoteRequired: false,
            totalMinor: parsed.data.priceNGN * 100,
            priceNGN: parsed.data.priceNGN,
            quotedAt: quotedAt.toISOString(),
          },
        },
      })
      return {
        ok: true as const,
        previous: { priceNGN: booking.priceNGN, quoteStatus: booking.quoteStatus },
        priceNGN: parsed.data.priceNGN,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  )
}
