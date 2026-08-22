import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  normalizePlaceResultLimit,
  normalizePlacesLanguageCode,
  normalizePlacesQuery,
  searchGooglePlaces,
} from '@/lib/maps/googlePlaces'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-places-autocomplete',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 90,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many place search requests', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const url = new URL(req.url)
  const normalized = normalizePlacesQuery(url.searchParams.get('q'))
  if (!normalized.ok) return mobileValidationError(normalized.message)

  const result = await searchGooglePlaces({
    query: normalized.query,
    languageCode: normalizePlacesLanguageCode(
      url.searchParams.get('locale') ?? url.searchParams.get('languageCode')
    ),
    limit: normalizePlaceResultLimit(url.searchParams.get('limit')),
  })

  if (!result.ok) {
    if (result.code === 'GOOGLE_PLACES_DISABLED') {
      return mobileError('PLACE_SEARCH_UNAVAILABLE', result.message, 503)
    }
    return mobileError('PLACE_SEARCH_FAILED', result.message, 502)
  }

  return Response.json({
    places: result.places,
    attribution: { provider: 'google_places' },
  })
}
