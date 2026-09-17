import { tours as defaultTours } from '@/data/tours'
import type { Tour } from '@/types'
import { catalogImageUrl } from '@/lib/mediaImage'
import { CANONICAL_TOUR_IDS, orderedTourIds, canonicalTourExecutionReadiness } from '@/lib/tourCommercial'
import {
  toTourItineraryDto,
  type TourItineraryDayDto,
  type TourExecutionReadiness,
} from '@/lib/tourItinerary'

const TOUR_IMAGE_FALLBACKS: Record<string, string> = {
  'cotonou-city-tour': '/images/routes/lagos-cotonou.jpg',
  'ouidah-tour': '/images/routes/lagos-cotonou.jpg',
  'ganvie-tour': '/images/routes/lagos-cotonou.jpg',
  'benin-history-lake': 'https://images.unsplash.com/photo-1612890009000-b9a73c018c85?auto=format&fit=crop&w=800&q=80',
  'lome-aneho-beach': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
  'accra-cape-coast': 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?auto=format&fit=crop&w=800&q=80',
  'west-africa-grand-tour': 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=800&q=80',
}

export function fallbackTourImage(tourId: string) {
  return TOUR_IMAGE_FALLBACKS[tourId] ?? TOUR_IMAGE_FALLBACKS['west-africa-grand-tour']
}

function publicTourFallback() {
  return defaultTours.map((tour) => ({
    ...tour,
    image: tour.image || fallbackTourImage(tour.id),
    transportationOnly: tour.id === 'ganvie-tour',
    pickupServiceArea: { city: 'Cotonou', countryCode: 'BJ' },
    gogotinkpoAvailable: false,
    executionReady: false,
    executionReadinessReason: 'no_itinerary_days',
    itineraryDays: [],
  }))
}

export type PublicTour = Tour & {
  transportationOnly: boolean
  pickupServiceArea: { city: string; countryCode: string }
  gogotinkpoAvailable: boolean
  executionReady: boolean
  executionReadinessReason: TourExecutionReadiness['reason']
  itineraryDays: TourItineraryDayDto[]
}

export async function ensureDefaultTours() {
  const { prisma } = await import('@/lib/prisma')
  const existing = await prisma.tour.findMany({ select: { id: true } })
  const existingIds = new Set(existing.map((t) => t.id))
  const missing = defaultTours.filter((t) => !existingIds.has(t.id))

  if (missing.length === 0) return

  await prisma.$transaction(
    missing.map((t) =>
      prisma.tour.create({
        data: {
          id: t.id,
          active: true,
          transportationOnly: t.id === 'ganvie-tour',
          title: t.title,
          titleFr: t.titleFr ?? null,
          destination: t.destination ?? null,
          destinationFr: t.destinationFr ?? null,
          country: t.country,
          countryFr: t.countryFr ?? null,
          durationDays: t.durationDays,
          startingFromNGN: t.startingFromNGN,
          image: t.image ?? null,
          description: t.description,
          descriptionFr: t.descriptionFr ?? null,
          highlights: t.highlights ?? [],
          highlightsFr: t.highlightsFr ?? [],
        },
      })
    )
  )
}

export async function getPublicTours() {
  try {
    const { prisma } = await import('@/lib/prisma')
    const tours = await prisma.tour.findMany({
      where: { active: true, id: { in: [...CANONICAL_TOUR_IDS] } },
      orderBy: [{ startingFromNGN: 'asc' }, { title: 'asc' }],
      include: {
        itineraryDays: {
          orderBy: { dayNumber: 'asc' },
          include: { stops: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    })

    return orderedTourIds(tours.map((tour) => tour.id)).map((id): PublicTour => {
      const t = tours.find((tour) => tour.id === id)!
      const readiness = canonicalTourExecutionReadiness(t)
      return {
        id: t.id,
        transportationOnly: t.transportationOnly,
        pickupServiceArea: { city: 'Cotonou', countryCode: 'BJ' },
        gogotinkpoAvailable: t.id === 'cotonou-city-tour' && t.itineraryDays.some((day) => day.stops.some((stop) => stop.addonCode === 'gogotinkpo')),
        title: t.title,
        titleFr: t.titleFr ?? t.title,
        destination: t.destination ?? t.country,
        destinationFr: t.destinationFr ?? t.destination ?? t.country,
        country: t.country,
        countryFr: t.countryFr,
        durationDays: t.durationDays,
        startingFromNGN: t.startingFromNGN,
        image: catalogImageUrl('tours', t.id, t.image, t.updatedAt) || fallbackTourImage(t.id),
        description: t.description,
        descriptionFr: t.descriptionFr ?? t.description,
        highlights: t.highlights,
        highlightsFr: t.highlightsFr,
        included: [],
        includedFr: [],
        executionReady: readiness.executionReady,
        executionReadinessReason: readiness.reason,
        itineraryDays: toTourItineraryDto(t),
      }
    })
  } catch (error) {
    console.error('Falling back to default tour catalog', error)
    return publicTourFallback()
  }
}

export async function getTourVehicleCategories() {
  const { prisma } = await import('@/lib/prisma')
  const [vehicles, rates] = await Promise.all([
    prisma.vehicle.findMany({ where: { available: true, tourPricingCategory: { not: null } }, orderBy: { capacity: 'asc' } }),
    prisma.tourCommercialRate.findMany({ where: { active: true } }),
  ])
  return vehicles.flatMap((vehicle) => {
    const rate = rates.find((row) => row.id === vehicle.tourPricingCategory)
    return rate ? [{ id: vehicle.id, name: vehicle.name, nameFr: vehicle.nameFr, capacity: vehicle.capacity,
      pricingCategory: rate.id, pricePerTour: { currency: 'NGN', minorUnit: 'kobo', minorValue: rate.priceMinor, value: rate.priceMinor / 100 } }] : []
  })
}
