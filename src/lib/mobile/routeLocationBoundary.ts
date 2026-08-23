import type { Route } from '@/types'
import type { MobileErrorCode } from '@/lib/mobile/errors'

export type RouteLocationBoundaryInput = {
  city?: string | null
  country?: string | null
  countryCode?: string | null
}

export type RouteLocationBoundaryResult =
  | { ok: true }
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

const CITY_ALIASES: Record<string, string> = {
  lome: 'lome',
  'porto novo': 'porto novo',
  portonovo: 'porto novo',
  'porto-novo': 'porto novo',
  kpalime: 'kpalime',
}

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

function locationMatchesRouteEndpoint({
  field,
  expectedCity,
  expectedCountry,
  location,
}: {
  field: 'pickup' | 'destination'
  expectedCity: string
  expectedCountry: string | null
  location: RouteLocationBoundaryInput | null | undefined
}): RouteLocationBoundaryResult {
  const expectedCountryCode = expectedCountryCodeForRouteCountry(expectedCountry)
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

  if (normalizeSupportedRouteCity(resolvedCity) !== normalizeSupportedRouteCity(expectedCity)) {
    return {
      ok: false,
      code: field === 'pickup' ? 'PICKUP_OUTSIDE_ROUTE_CITY' : 'DESTINATION_OUTSIDE_ROUTE_CITY',
      message:
        field === 'pickup'
          ? `Your pickup location must be within ${expectedCity}`
          : `Your destination must be within ${expectedCity}`,
      details,
    }
  }

  if (expectedCountryCode && resolvedCountryCode && expectedCountryCode !== resolvedCountryCode) {
    return {
      ok: false,
      code: field === 'pickup' ? 'PICKUP_OUTSIDE_ROUTE_CITY' : 'DESTINATION_OUTSIDE_ROUTE_CITY',
      message:
        field === 'pickup'
          ? `Your pickup location must be within ${expectedCity}`
          : `Your destination must be within ${expectedCity}`,
      details,
    }
  }

  return { ok: true }
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
  const pickupResult = locationMatchesRouteEndpoint({
    field: 'pickup',
    expectedCity: route.from,
    expectedCountry: route.fromCountry,
    location: pickup,
  })
  if (!pickupResult.ok) return pickupResult

  return locationMatchesRouteEndpoint({
    field: 'destination',
    expectedCity: route.to,
    expectedCountry: route.toCountry,
    location: destination,
  })
}
