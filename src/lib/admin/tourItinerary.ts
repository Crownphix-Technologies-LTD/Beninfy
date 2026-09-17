import { prisma } from '@/lib/prisma'
import { CANONICAL_TOUR_IDS, canonicalTourExecutionReadiness } from '@/lib/tourCommercial'
import { tourItinerarySchema, type ItineraryResponse } from '@/lib/admin/tourItineraryForm'
import {
  toTourItineraryDto,
  tourExecutionReadiness,
  tourItineraryCreateData,
  validateTourItineraryTemplate,
  type TourWithItinerary,
} from '@/lib/tourItinerary'

const itineraryInclude = {
  itineraryDays: {
    orderBy: { dayNumber: 'asc' as const },
    include: { stops: { orderBy: { sortOrder: 'asc' as const } } },
  },
}

export function findAdminTourItinerary(id: string) {
  return prisma.tour.findUnique({ where: { id }, include: itineraryInclude })
}

export function adminTourItineraryResponse(
  tour: TourWithItinerary & { id: string; updatedAt: Date }
): ItineraryResponse {
  const readiness = CANONICAL_TOUR_IDS.includes(tour.id as typeof CANONICAL_TOUR_IDS[number])
    ? canonicalTourExecutionReadiness(tour) : tourExecutionReadiness(tour)
  return {
    tourId: tour.id,
    updatedAt: tour.updatedAt.toISOString(),
    itineraryDays: toTourItineraryDto(tour),
    executionReady: readiness.executionReady,
    executionReadinessReason: readiness.reason,
  }
}

export async function saveAdminTourItinerary(id: string, body: unknown) {
  const parsed = tourItinerarySchema.safeParse(body)
  if (!parsed.success)
    return {
      ok: false as const,
      status: 400,
      error: 'Invalid input',
      issues: parsed.error.flatten(),
    }
  if (CANONICAL_TOUR_IDS.includes(id as typeof CANONICAL_TOUR_IDS[number]) && parsed.data.days.length !== 1)
    return { ok: false as const, status: 400, error: 'Canonical Tours require exactly one itinerary day' }
  if (id !== 'cotonou-city-tour' && parsed.data.days.some((day) => day.stops.some((stop) => stop.addonCode)))
    return { ok: false as const, status: 400, error: 'Gogotinkpo is only available for Cotonou City Tour' }
  const validated = validateTourItineraryTemplate(parsed.data.days)
  if (!validated.ok)
    return { ok: false as const, status: 400, error: 'Invalid itinerary', code: validated.code }

  return prisma.$transaction(async (tx) => {
    // Serialize full-template replacements and reject stale editor saves.
    const current = await tx.$queryRaw<Array<{ updatedAt: Date }>>`
      SELECT "updatedAt" FROM "Tour" WHERE id = ${id} FOR UPDATE
    `
    if (!current.length) return { ok: false as const, status: 404, error: 'Tour not found' }
    if (
      parsed.data.expectedUpdatedAt &&
      current[0].updatedAt.toISOString() !== parsed.data.expectedUpdatedAt
    ) {
      return {
        ok: false as const,
        status: 409,
        error:
          'This Tour changed since you opened it. Your draft is kept. Reload the saved itinerary before applying your changes.',
      }
    }
    // Template IDs are source references only, not relations to booking snapshots.
    await tx.tourItineraryDay.deleteMany({ where: { tourId: id } })
    const tour = await tx.tour.update({
      where: { id },
      data: {
        // Nested relation writes alone do not advance Tour.updatedAt.
        updatedAt: new Date(Math.max(Date.now(), current[0].updatedAt.getTime() + 1)),
        itineraryDays: { create: tourItineraryCreateData(validated.days) },
      },
      include: itineraryInclude,
    })
    return { ok: true as const, tour, response: adminTourItineraryResponse(tour) }
  })
}
