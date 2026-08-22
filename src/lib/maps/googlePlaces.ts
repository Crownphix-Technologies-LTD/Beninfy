export type MobilePlaceDto = {
  placeId: string
  displayName: string
  formattedAddress: string | null
  latitude: number | null
  longitude: number | null
  city: string | null
  country: string | null
  countryCode: string | null
}

type GooglePlaceText = {
  text?: string
}

export type GooglePlacePrediction = {
  place?: string
  placeId?: string
  text?: GooglePlaceText
  structuredFormat?: {
    mainText?: GooglePlaceText
    secondaryText?: GooglePlaceText
  }
  types?: string[]
}

export type GooglePlaceDetails = {
  id?: string
  name?: string
  displayName?: GooglePlaceText
  formattedAddress?: string
  location?: {
    latitude?: number
    longitude?: number
  }
  addressComponents?: GoogleAddressComponent[]
}

type GoogleAddressComponent = {
  longText?: string
  shortText?: string
  types?: string[]
}

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: GooglePlacePrediction
  }>
  error?: { message?: string }
}

type PlaceSearchResult =
  | { ok: true; places: MobilePlaceDto[] }
  | { ok: false; code: 'GOOGLE_PLACES_DISABLED' | 'GOOGLE_PLACES_ERROR'; message: string }

type PlaceDetailResult =
  | { ok: true; place: MobilePlaceDto }
  | {
      ok: false
      code: 'GOOGLE_PLACES_DISABLED' | 'GOOGLE_PLACES_NOT_FOUND' | 'GOOGLE_PLACES_ERROR'
      message: string
    }

const PLACES_API_BASE_URL = 'https://places.googleapis.com/v1'
const DEFAULT_REGION_CODES = ['ng', 'bj', 'tg', 'gh']

export function getGooglePlacesServerKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null
}

export function normalizePlacesQuery(value: string | null) {
  const query = value?.trim().replace(/\s+/g, ' ') ?? ''
  if (query.length < 2)
    return { ok: false as const, message: 'Search query must be at least 2 characters' }
  if (query.length > 120)
    return { ok: false as const, message: 'Search query must be 120 characters or fewer' }
  return { ok: true as const, query }
}

export function normalizePlaceResultLimit(value: string | null) {
  const parsed = Number(value ?? 6)
  if (!Number.isFinite(parsed)) return 6
  return Math.min(8, Math.max(1, Math.trunc(parsed)))
}

export function normalizePlacesLanguageCode(value: string | null) {
  const code = value?.trim().toLowerCase()
  return code === 'fr' ? 'fr' : 'en'
}

function stripPlaceResourceName(value: string | undefined) {
  if (!value) return ''
  return value.replace(/^places\//, '').trim()
}

export function normalizePlaceId(value: string | null) {
  const placeId = stripPlaceResourceName(value ?? '')
  if (placeId.length < 3 || placeId.length > 180 || placeId.includes('/')) {
    return { ok: false as const, message: 'Place id is invalid' }
  }
  return { ok: true as const, placeId }
}

function firstComponent(components: GoogleAddressComponent[] | undefined, type: string) {
  return components?.find((component) => component.types?.includes(type))
}

export function extractSupportedCity(components: GoogleAddressComponent[] | undefined) {
  const city =
    firstComponent(components, 'locality')?.longText ||
    firstComponent(components, 'postal_town')?.longText ||
    firstComponent(components, 'administrative_area_level_2')?.longText ||
    firstComponent(components, 'administrative_area_level_1')?.longText ||
    null
  const countryComponent = firstComponent(components, 'country')

  return {
    city,
    country: countryComponent?.longText ?? null,
    countryCode: countryComponent?.shortText?.toUpperCase() ?? null,
  }
}

export function toMobilePlacePredictionDto(
  prediction: GooglePlacePrediction
): MobilePlaceDto | null {
  const placeId = prediction.placeId || stripPlaceResourceName(prediction.place)
  const displayName =
    prediction.structuredFormat?.mainText?.text ||
    prediction.text?.text ||
    prediction.placeId ||
    placeId
  if (!placeId || !displayName) return null

  return {
    placeId,
    displayName,
    formattedAddress:
      prediction.structuredFormat?.secondaryText?.text || prediction.text?.text || null,
    latitude: null,
    longitude: null,
    city: null,
    country: null,
    countryCode: null,
  }
}

export function toMobilePlaceDetailDto(place: GooglePlaceDetails): MobilePlaceDto | null {
  const placeId = place.id || stripPlaceResourceName(place.name)
  const displayName = place.displayName?.text || place.formattedAddress || placeId
  if (!placeId || !displayName) return null

  const coordinates =
    typeof place.location?.latitude === 'number' && typeof place.location.longitude === 'number'
      ? { latitude: place.location.latitude, longitude: place.location.longitude }
      : { latitude: null, longitude: null }
  const location = extractSupportedCity(place.addressComponents)

  return {
    placeId,
    displayName,
    formattedAddress: place.formattedAddress ?? null,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    city: location.city,
    country: location.country,
    countryCode: location.countryCode,
  }
}

export async function searchGooglePlaces({
  query,
  languageCode = 'en',
  limit = 6,
  timeoutMs = 3500,
}: {
  query: string
  languageCode?: 'en' | 'fr'
  limit?: number
  timeoutMs?: number
}): Promise<PlaceSearchResult> {
  const key = getGooglePlacesServerKey()
  if (!key) {
    return {
      ok: false,
      code: 'GOOGLE_PLACES_DISABLED',
      message: 'Google Places API is not configured',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${PLACES_API_BASE_URL}/places:autocomplete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
      },
      body: JSON.stringify({
        input: query,
        languageCode,
        includedRegionCodes: DEFAULT_REGION_CODES,
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    const json = (await response.json().catch(() => ({}))) as GoogleAutocompleteResponse
    if (!response.ok) {
      return {
        ok: false,
        code: 'GOOGLE_PLACES_ERROR',
        message: json.error?.message || `Google Places autocomplete failed (${response.status})`,
      }
    }

    return {
      ok: true,
      places: (json.suggestions ?? [])
        .map((suggestion) =>
          suggestion.placePrediction ? toMobilePlacePredictionDto(suggestion.placePrediction) : null
        )
        .filter((place): place is MobilePlaceDto => Boolean(place))
        .slice(0, limit),
    }
  } catch (error) {
    return {
      ok: false,
      code: 'GOOGLE_PLACES_ERROR',
      message: error instanceof Error ? error.message : 'Google Places autocomplete failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function getGooglePlaceDetails({
  placeId,
  languageCode = 'en',
  timeoutMs = 3500,
}: {
  placeId: string
  languageCode?: 'en' | 'fr'
  timeoutMs?: number
}): Promise<PlaceDetailResult> {
  const key = getGooglePlacesServerKey()
  if (!key) {
    return {
      ok: false,
      code: 'GOOGLE_PLACES_DISABLED',
      message: 'Google Places API is not configured',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const params = new URLSearchParams({ languageCode })
    const response = await fetch(
      `${PLACES_API_BASE_URL}/places/${encodeURIComponent(placeId)}?${params}`,
      {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
        },
        signal: controller.signal,
        cache: 'no-store',
      }
    )
    const json = (await response.json().catch(() => ({}))) as GooglePlaceDetails & {
      error?: { message?: string }
    }
    if (response.status === 404) {
      return { ok: false, code: 'GOOGLE_PLACES_NOT_FOUND', message: 'Place was not found' }
    }
    if (!response.ok) {
      return {
        ok: false,
        code: 'GOOGLE_PLACES_ERROR',
        message: json.error?.message || `Google Place Details failed (${response.status})`,
      }
    }

    const place = toMobilePlaceDetailDto(json)
    if (!place)
      return { ok: false, code: 'GOOGLE_PLACES_NOT_FOUND', message: 'Place was not found' }
    return { ok: true, place }
  } catch (error) {
    return {
      ok: false,
      code: 'GOOGLE_PLACES_ERROR',
      message: error instanceof Error ? error.message : 'Google Place Details failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}
