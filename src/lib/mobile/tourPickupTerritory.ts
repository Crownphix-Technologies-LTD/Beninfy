import { reverseGeocodeGooglePlace } from '@/lib/maps/googlePlaces'
import { normalizeSupportedRouteCity } from '@/lib/mobile/routeLocationBoundary'
import type { TourPickup } from '@/lib/mobile/tourPickup'

export function isCotonouTourPickup(place: {
  city: string | null
  countryCode: string | null
  resolved: boolean
}) {
  return (
    place.resolved &&
    normalizeSupportedRouteCity(place.city) === 'cotonou' &&
    place.countryCode === 'BJ'
  )
}

export async function validateCotonouTourPickup(pickup: TourPickup) {
  const result = await reverseGeocodeGooglePlace(pickup.coordinates)
  if (!result.ok) return { ok: false as const, code: 'PLACE_SEARCH_UNAVAILABLE' as const }
  if (!isCotonouTourPickup(result.place))
    return { ok: false as const, code: 'TOUR_PICKUP_OUTSIDE_COTONOU' as const }
  return { ok: true as const }
}
