import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { mobileError, mobileValidationError } from '@/lib/mobile/errors'
import { guestNoStoreHeaders } from '@/lib/mobile/guestDiscovery'
import {
  getGooglePlaceDetails,
  normalizePlaceId,
  normalizePlacesLanguageCode,
} from '@/lib/maps/googlePlaces'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const limit = await checkRateLimit({
    scope: 'mobile-guest-place-detail',
    identifier: requestIp(req),
    limit: 45,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed)
    return mobileError('RATE_LIMITED', 'Too many place detail requests', 429, {
      retryAfter: limit.retryAfter,
    })

  const { placeId: rawPlaceId } = await params
  const normalized = normalizePlaceId(decodeURIComponent(rawPlaceId))
  if (!normalized.ok) return mobileValidationError(normalized.message)
  const url = new URL(req.url)
  const result = await getGooglePlaceDetails({
    placeId: normalized.placeId,
    languageCode: normalizePlacesLanguageCode(
      url.searchParams.get('locale') ?? url.searchParams.get('languageCode')
    ),
  })
  if (!result.ok) {
    if (result.code === 'GOOGLE_PLACES_DISABLED')
      return mobileError('PLACE_SEARCH_UNAVAILABLE', result.message, 503)
    if (result.code === 'GOOGLE_PLACES_NOT_FOUND')
      return mobileError('PLACE_NOT_FOUND', result.message, 404)
    return mobileError('PLACE_SEARCH_FAILED', result.message, 502)
  }

  return Response.json(
    { place: result.place, attribution: { provider: 'google_places' } },
    { headers: guestNoStoreHeaders() }
  )
}
