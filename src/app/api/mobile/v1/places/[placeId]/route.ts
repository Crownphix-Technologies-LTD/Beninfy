import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  getGooglePlaceDetails,
  normalizePlaceId,
  normalizePlacesLanguageCode,
} from '@/lib/maps/googlePlaces'

export const runtime = 'nodejs'

export async function GET(req: Request, { params }: { params: Promise<{ placeId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-place-detail',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 120,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many place detail requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

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
    if (result.code === 'GOOGLE_PLACES_DISABLED') {
      return mobileError('PLACE_SEARCH_UNAVAILABLE', result.message, 503)
    }
    if (result.code === 'GOOGLE_PLACES_NOT_FOUND') {
      return mobileError('PLACE_NOT_FOUND', result.message, 404)
    }
    return mobileError('PLACE_SEARCH_FAILED', result.message, 502)
  }

  return Response.json({
    place: result.place,
    attribution: { provider: 'google_places' },
  })
}
