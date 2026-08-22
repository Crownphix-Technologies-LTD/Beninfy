import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  normalizeCoordinateInput,
  normalizePlacesLanguageCode,
  reverseGeocodeGooglePlace,
} from '@/lib/maps/googlePlaces'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-places-reverse',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 60,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many current-location lookup requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const url = new URL(req.url)
  const coordinates = normalizeCoordinateInput(
    url.searchParams.get('latitude'),
    url.searchParams.get('longitude')
  )
  if (!coordinates.ok) return mobileValidationError(coordinates.message)

  const result = await reverseGeocodeGooglePlace({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    languageCode: normalizePlacesLanguageCode(
      url.searchParams.get('locale') ?? url.searchParams.get('languageCode')
    ),
  })

  if (!result.ok) {
    if (result.code === 'GOOGLE_PLACES_DISABLED') {
      return mobileError('PLACE_SEARCH_UNAVAILABLE', result.message, 503)
    }
    return mobileError('PLACE_SEARCH_FAILED', result.message, 502)
  }

  return Response.json({
    place: result.place,
    unresolved: !result.place.resolved,
    attribution: { provider: 'google_geocoding' },
  })
}
