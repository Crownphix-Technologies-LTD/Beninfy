export type LatLng = {
  latitude: number
  longitude: number
}

export type GoogleRouteRequest = {
  origin: LatLng
  destination: LatLng
  intermediates?: LatLng[]
  trafficAware?: boolean
  departureTime?: Date
  timeoutMs?: number
}

export type NormalizedRoute = {
  provider: 'google-routes'
  encodedPolyline: string | null
  distanceMeters: number | null
  durationSeconds: number | null
  trafficDurationSeconds: number | null
  calculatedAt: Date
}

export type GoogleRouteResult =
  | { ok: true; route: NormalizedRoute }
  | {
      ok: false
      code: 'GOOGLE_ROUTES_DISABLED' | 'GOOGLE_ROUTES_INVALID_INPUT' | 'GOOGLE_ROUTES_ERROR'
      message: string
    }

function apiKey() {
  return process.env.GOOGLE_ROUTES_API_KEY?.trim() || null
}

function validCoordinate(point: LatLng) {
  return (
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180
  )
}

function parseDurationSeconds(value: string | undefined) {
  if (!value?.endsWith('s')) return null
  const seconds = Number(value.slice(0, -1))
  return Number.isFinite(seconds) ? Math.round(seconds) : null
}

function waypoint(point: LatLng) {
  return { location: { latLng: point } }
}

export async function computeGoogleRoute(input: GoogleRouteRequest): Promise<GoogleRouteResult> {
  const key = apiKey()
  if (!key) {
    return {
      ok: false,
      code: 'GOOGLE_ROUTES_DISABLED',
      message: 'Google Routes API is not configured',
    }
  }
  if (
    !validCoordinate(input.origin) ||
    !validCoordinate(input.destination) ||
    input.intermediates?.some((point) => !validCoordinate(point))
  ) {
    return {
      ok: false,
      code: 'GOOGLE_ROUTES_INVALID_INPUT',
      message: 'Route coordinates are invalid',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 3500)
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: waypoint(input.origin),
        destination: waypoint(input.destination),
        ...(input.intermediates?.length ? { intermediates: input.intermediates.map(waypoint) } : {}),
        travelMode: 'DRIVE',
        routingPreference: input.trafficAware ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
        polylineQuality: 'OVERVIEW',
        polylineEncoding: 'ENCODED_POLYLINE',
        ...(input.departureTime ? { departureTime: input.departureTime.toISOString() } : {}),
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as {
      routes?: Array<{
        distanceMeters?: number
        duration?: string
        staticDuration?: string
        polyline?: { encodedPolyline?: string }
      }>
      error?: { message?: string }
    }
    if (!res.ok || !json.routes?.[0]) {
      return {
        ok: false,
        code: 'GOOGLE_ROUTES_ERROR',
        message: json.error?.message || `Google Routes failed (${res.status})`,
      }
    }

    const route = json.routes[0]
    return {
      ok: true,
      route: {
        provider: 'google-routes',
        encodedPolyline: route.polyline?.encodedPolyline ?? null,
        distanceMeters: typeof route.distanceMeters === 'number' ? route.distanceMeters : null,
        durationSeconds: parseDurationSeconds(route.staticDuration) ?? parseDurationSeconds(route.duration),
        trafficDurationSeconds: parseDurationSeconds(route.duration),
        calculatedAt: new Date(),
      },
    }
  } catch (error) {
    return {
      ok: false,
      code: 'GOOGLE_ROUTES_ERROR',
      message: error instanceof Error ? error.message : 'Google Routes failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}

