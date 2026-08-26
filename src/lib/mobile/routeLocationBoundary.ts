import type { Route } from '@/types'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import type { LagosPickupArea } from '@/data/pricing'

export type RouteLocationBoundaryInput = {
  city?: string | null
  country?: string | null
  countryCode?: string | null
}

export type RouteLocationBoundaryResult =
  | { ok: true; metadata: RouteServiceAreaValidationMetadata }
  | {
      ok: false
      code: Extract<
        MobileErrorCode,
        'PICKUP_OUTSIDE_ROUTE_CITY' | 'DESTINATION_OUTSIDE_ROUTE_CITY' | 'LOCATION_CITY_UNRESOLVED'
      >
      message: string
      details: {
        field: 'pickup' | 'destination'
        expectedCity: string
        expectedCountry: string | null
        expectedCountryCode: string | null
        resolvedCity: string | null
        resolvedCountry: string | null
        resolvedCountryCode: string | null
      }
    }

export type RouteServiceArea = {
  city: string
  countryCode: string
  acceptedLocalities: string[]
}

export type RouteServiceAreaMatch = {
  serviceArea: {
    city: string
    countryCode: string
  }
  resolvedLocality: string
  resolvedCountry: string | null
  resolvedCountryCode: string | null
}

export type LagosPickupFareZone = {
  code: 'lagos_mainland' | 'lagos_island'
  label: 'Mainland' | 'Island'
  pricingScope: LagosPickupArea
}

export type RouteServiceAreaValidationMetadata = {
  pickupServiceArea: RouteServiceAreaMatch
  destinationServiceArea: RouteServiceAreaMatch
  pickupFareZone: LagosPickupFareZone | null
}

const CITY_ALIASES: Record<string, string> = {
  lome: 'lome',
  'porto novo': 'porto novo',
  portonovo: 'porto novo',
  'porto-novo': 'porto novo',
  kpalime: 'kpalime',
}

const SERVICE_AREAS: Record<string, RouteServiceArea> = {
  lagos: {
    city: 'Lagos',
    countryCode: 'NG',
    acceptedLocalities: [
      'Lagos',
      'Ikeja',
      'Lekki',
      'Badagry',
      'Ikorodu',
      'Yaba',
      'Surulere',
      'Gbagada',
      'Maryland',
      'Victoria Island',
      'Ikoyi',
      'Lagos Island',
      'Ajah',
      'Oniru',
      'Banana Island',
    ],
  },
  cotonou: {
    city: 'Cotonou',
    countryCode: 'BJ',
    acceptedLocalities: ['Cotonou'],
  },
  'porto novo': {
    city: 'Porto Novo',
    countryCode: 'BJ',
    acceptedLocalities: ['Porto Novo', 'Porto-Novo'],
  },
  ouidah: {
    city: 'Ouidah',
    countryCode: 'BJ',
    acceptedLocalities: ['Ouidah'],
  },
  lome: {
    city: 'Lomé',
    countryCode: 'TG',
    acceptedLocalities: ['Lomé', 'Lome'],
  },
  aneho: {
    city: 'Aneho',
    countryCode: 'TG',
    acceptedLocalities: ['Aneho', 'Aného'],
  },
  kpalime: {
    city: 'Kpalime',
    countryCode: 'TG',
    acceptedLocalities: ['Kpalime', 'Kpalimé'],
  },
  accra: {
    city: 'Accra',
    countryCode: 'GH',
    acceptedLocalities: ['Accra'],
  },
}

const LAGOS_MAINLAND_LOCALITIES = new Set(
  ['Lagos', 'Ikeja', 'Yaba', 'Surulere', 'Gbagada', 'Maryland', 'Ikorodu'].map(
    normalizeSupportedRouteCity
  )
)

const LAGOS_ISLAND_LOCALITIES = new Set(
  ['Lekki', 'Victoria Island', 'Ikoyi', 'Lagos Island', 'Ajah', 'Oniru', 'Banana Island'].map(
    normalizeSupportedRouteCity
  )
)

const ROUTE_COUNTRY_CODES: Record<string, string> = {
  nigeria: 'NG',
  benin: 'BJ',
  'benin republic': 'BJ',
  togo: 'TG',
  ghana: 'GH',
}

function fold(value: string | null | undefined) {
  return (value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function normalizeSupportedRouteCity(value: string | null | undefined) {
  const normalized = fold(value)
  return CITY_ALIASES[normalized] ?? normalized
}

export function normalizeSupportedCountryCode({
  country,
  countryCode,
}: {
  country?: string | null
  countryCode?: string | null
}) {
  const code = countryCode?.trim().toUpperCase()
  if (code) return code
  const normalizedCountry = fold(country)
  return ROUTE_COUNTRY_CODES[normalizedCountry] ?? null
}

export function expectedCountryCodeForRouteCountry(country: string | null | undefined) {
  return normalizeSupportedCountryCode({ country })
}

export function getRouteServiceArea(city: string | null | undefined) {
  const key = normalizeSupportedRouteCity(city)
  return SERVICE_AREAS[key] ?? null
}

export function locationMatchesRouteServiceArea({
  field,
  expectedCity,
  expectedCountry,
  location,
}: {
  field: 'pickup' | 'destination'
  expectedCity: string
  expectedCountry: string | null
  location: RouteLocationBoundaryInput | null | undefined
}):
  | { ok: true; match: RouteServiceAreaMatch }
  | Extract<RouteLocationBoundaryResult, { ok: false }> {
  const serviceArea = getRouteServiceArea(expectedCity)
  const expectedCountryCode = serviceArea?.countryCode ?? expectedCountryCodeForRouteCountry(expectedCountry)
  const resolvedCity = location?.city?.trim() || null
  const resolvedCountry = location?.country?.trim() || null
  const resolvedCountryCode = normalizeSupportedCountryCode({
    country: location?.country,
    countryCode: location?.countryCode,
  })
  const details = {
    field,
    expectedCity,
    expectedCountry,
    expectedCountryCode,
    resolvedCity,
    resolvedCountry,
    resolvedCountryCode,
  }

  if (!resolvedCity) {
    return {
      ok: false,
      code: 'LOCATION_CITY_UNRESOLVED',
      message:
        field === 'pickup'
          ? 'Pickup city could not be resolved'
          : 'Destination city could not be resolved',
      details,
    }
  }

  if (expectedCountryCode && resolvedCountryCode && expectedCountryCode !== resolvedCountryCode) {
    return {
      ok: false,
      code: field === 'pickup' ? 'PICKUP_OUTSIDE_ROUTE_CITY' : 'DESTINATION_OUTSIDE_ROUTE_CITY',
      message:
        field === 'pickup'
          ? `Your pickup location must be within the ${expectedCity} service area`
          : `Your destination must be within the ${expectedCity} service area`,
      details,
    }
  }

  const normalizedResolvedCity = normalizeSupportedRouteCity(resolvedCity)
  const acceptedLocalities = serviceArea?.acceptedLocalities ?? [expectedCity]
  const belongsToServiceArea = acceptedLocalities
    .map(normalizeSupportedRouteCity)
    .includes(normalizedResolvedCity)

  if (!belongsToServiceArea) {
    return {
      ok: false,
      code: field === 'pickup' ? 'PICKUP_OUTSIDE_ROUTE_CITY' : 'DESTINATION_OUTSIDE_ROUTE_CITY',
      message:
        field === 'pickup'
          ? `Your pickup location must be within the ${expectedCity} service area`
          : `Your destination must be within the ${expectedCity} service area`,
      details,
    }
  }

  return {
    ok: true,
    match: {
      serviceArea: {
        city: serviceArea?.city ?? expectedCity,
        countryCode: expectedCountryCode ?? '',
      },
      resolvedLocality: resolvedCity,
      resolvedCountry,
      resolvedCountryCode,
    },
  }
}

export function resolveLagosPickupFareZone(
  location: RouteLocationBoundaryInput | RouteServiceAreaMatch | null | undefined
): LagosPickupFareZone | null {
  const locality = isServiceAreaMatch(location) ? location.resolvedLocality : location?.city
  const normalized = normalizeSupportedRouteCity(locality)
  if (LAGOS_MAINLAND_LOCALITIES.has(normalized)) {
    return { code: 'lagos_mainland', label: 'Mainland', pricingScope: 'mainland' }
  }
  if (LAGOS_ISLAND_LOCALITIES.has(normalized)) {
    return { code: 'lagos_island', label: 'Island', pricingScope: 'island' }
  }
  return null
}

function isServiceAreaMatch(
  location: RouteLocationBoundaryInput | RouteServiceAreaMatch | null | undefined
): location is RouteServiceAreaMatch {
  return Boolean(location && 'resolvedLocality' in location)
}

export function resolvePickupFareZoneForRoute({
  route,
  pickup,
}: {
  route: Pick<Route, 'from' | 'fromCountry'>
  pickup: RouteLocationBoundaryInput | RouteServiceAreaMatch | null | undefined
}) {
  if (normalizeSupportedRouteCity(route.from) !== 'lagos') return null
  return resolveLagosPickupFareZone(pickup)
}

export function validateRouteLocationBoundaries({
  route,
  pickup,
  destination,
}: {
  route: Pick<Route, 'from' | 'fromCountry' | 'to' | 'toCountry'>
  pickup?: RouteLocationBoundaryInput | null
  destination?: RouteLocationBoundaryInput | null
}): RouteLocationBoundaryResult {
  const pickupResult = locationMatchesRouteServiceArea({
    field: 'pickup',
    expectedCity: route.from,
    expectedCountry: route.fromCountry,
    location: pickup,
  })
  if (!pickupResult.ok) return pickupResult

  const destinationResult = locationMatchesRouteServiceArea({
    field: 'destination',
    expectedCity: route.to,
    expectedCountry: route.toCountry,
    location: destination,
  })
  if (!destinationResult.ok) return destinationResult

  return {
    ok: true,
    metadata: {
      pickupServiceArea: pickupResult.match,
      destinationServiceArea: destinationResult.match,
      pickupFareZone: resolvePickupFareZoneForRoute({ route, pickup: pickupResult.match }),
    },
  }
}
