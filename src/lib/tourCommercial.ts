import { z } from 'zod'
import {
  tourExecutionReadiness,
  type TourWithItinerary,
  type TourExecutionReadiness,
} from '@/lib/tourItinerary'

export const CANONICAL_TOUR_IDS = ['cotonou-city-tour', 'ouidah-tour', 'ganvie-tour'] as const
export const TOUR_PRICING_CATEGORIES = ['sedan', 'sienna', 'suv', 'odyssey', 'gx460'] as const

export function canonicalTourExecutionReadiness(tour: TourWithItinerary): TourExecutionReadiness {
  const readiness = tourExecutionReadiness(tour)
  if (!readiness.executionReady) return readiness
  if (tour.itineraryDays.length !== 1)
    return { executionReady: false, reason: 'invalid_canonical_day_count' }
  if (!tour.itineraryDays[0].stops.some((stop) => !stop.addonCode))
    return { executionReady: false, reason: 'missing_day_stop' }
  return readiness
}
export const INITIAL_TOUR_RATES_MINOR = {
  sedan: 10_000_000,
  sienna: 15_000_000,
  suv: 17_500_000,
  odyssey: 20_000_000,
  gx460: 20_000_000,
} as const

export const tourCommercialSelectionSchema = z
  .object({
    tourIds: z.array(z.enum(CANONICAL_TOUR_IDS)).min(1).max(3),
    vehicleCategoryId: z.string().trim().min(1).max(80),
    gogotinkpo: z.boolean().default(false),
    itineraryMode: z.enum(['standard', 'custom']).default('standard'),
    customItinerary: z.string().trim().min(10).max(4000).optional(),
  })
  .superRefine((input, ctx) => {
    if (new Set(input.tourIds).size !== input.tourIds.length)
      ctx.addIssue({ code: 'custom', path: ['tourIds'], message: 'Select each Tour once' })
    if (input.gogotinkpo && !input.tourIds.includes('cotonou-city-tour'))
      ctx.addIssue({
        code: 'custom',
        path: ['gogotinkpo'],
        message: 'Gogotinkpo requires Cotonou City Tour',
      })
    if (input.itineraryMode === 'custom' && !input.customItinerary)
      ctx.addIssue({
        code: 'custom',
        path: ['customItinerary'],
        message: 'Describe the custom itinerary',
      })
    if (input.itineraryMode === 'standard' && input.customItinerary)
      ctx.addIssue({
        code: 'custom',
        path: ['customItinerary'],
        message: 'Choose custom itinerary mode',
      })
  })

export type TourCommercialSelection = z.infer<typeof tourCommercialSelectionSchema>

export function orderedTourIds(ids: readonly string[]) {
  return CANONICAL_TOUR_IDS.filter((id) => ids.includes(id))
}

export function tourVehicleQualifies(input: {
  selectedCategoryId: string | null
  selectedPricingCategory: string | null
  travellers: number
  vehicle: {
    id: string
    tourPricingCategory: string | null
    capacity: number
    available: boolean
  } | null
}) {
  const vehicle = input.vehicle
  if (!vehicle?.available || vehicle.capacity < input.travellers) return false
  return input.selectedPricingCategory
    ? vehicle.tourPricingCategory === input.selectedPricingCategory
    : vehicle.id === input.selectedCategoryId
}

export function calculateTourCommercialSnapshot(input: {
  tourIds: readonly string[]
  priceMinor: number
  gogotinkpo: boolean
}) {
  if (
    !Number.isSafeInteger(input.priceMinor) ||
    input.priceMinor <= 0 ||
    input.priceMinor % 100 !== 0
  )
    throw new Error('Tour price must be a positive whole-naira minor-unit amount')
  const ids = orderedTourIds(input.tourIds)
  if (
    !ids.length ||
    ids.length !== input.tourIds.length ||
    new Set(input.tourIds).size !== ids.length
  )
    throw new Error('Invalid Tour selection')
  if (input.gogotinkpo && !ids.includes('cotonou-city-tour'))
    throw new Error('Invalid Gogotinkpo selection')
  const components = ids.map((tourId) => {
    const addonMinor = input.gogotinkpo && tourId === 'cotonou-city-tour' ? input.priceMinor / 5 : 0
    return {
      tourId,
      basePriceMinor: input.priceMinor,
      addonMinor,
      totalMinor: input.priceMinor + addonMinor,
      gogotinkpo: addonMinor > 0,
      transportationOnly: tourId === 'ganvie-tour',
    }
  })
  const totalMinor = components.reduce((sum, component) => sum + component.totalMinor, 0)
  if (!Number.isSafeInteger(totalMinor) || totalMinor > 214_748_3647 || totalMinor % 100 !== 0)
    throw new Error('Tour price exceeds supported amount')
  return {
    version: 1,
    currency: 'NGN',
    pricingBasis: 'vehicle_per_selected_tour',
    components,
    totalMinor,
    priceNGN: totalMinor / 100,
  }
}
