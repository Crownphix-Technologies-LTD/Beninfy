import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { mobileError, mobileValidationError } from '@/lib/mobile/errors'
import { guestNoStoreHeaders } from '@/lib/mobile/guestDiscovery'
import {
  normalizeCoordinateInput,
  normalizePlacesLanguageCode,
  reverseGeocodeGooglePlace,
} from '@/lib/maps/googlePlaces'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const limit = await checkRateLimit({
    scope: 'mobile-guest-places-reverse',
    identifier: requestIp(req),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return mobileError('RATE_LIMITED', 'Too many current-location lookup requests', 429, {
      retryAfter: limit.retryAfter,
    })

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
    if (result.code === 'GOOGLE_PLACES_DISABLED')
      return mobileError('PLACE_SEARCH_UNAVAILABLE', result.message, 503)
    return mobileError('PLACE_SEARCH_FAILED', result.message, 502)
  }

  return Response.json(
    {
      place: result.place,
      unresolved: !result.place.resolved,
      attribution: { provider: 'google_geocoding' },
    },
    { headers: guestNoStoreHeaders() }
  )
}
