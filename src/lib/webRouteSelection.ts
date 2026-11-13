export type WebRouteDto = {
  id: string
  canonicalRouteId: string
  pricingRouteId: string
  direction: 'explicit' | 'reverse_projection'
  origin: { city: string; code: string; country: string }
  destination: { city: string; code: string; country: string }
  displayName: string
  durationHours: number
  popular: boolean
  image: string
  description: string
  descriptionFr: string
  borderCrossings: string[]
  available: boolean
}

function normalizedCity(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? ''
}

export function routeOrigins(routes: WebRouteDto[]) {
  const origins = new Map<string, string>()
  for (const route of routes) {
    if (!route.available) continue
    origins.set(normalizedCity(route.origin.city), route.origin.city)
  }
  return [...origins.values()].sort((a, b) => a.localeCompare(b))
}

export function routeDestinations(routes: WebRouteDto[], origin: string) {
  const normalizedOrigin = normalizedCity(origin)
  const destinations = new Map<string, string>()
  for (const route of routes) {
    if (!route.available || normalizedCity(route.origin.city) !== normalizedOrigin) continue
    destinations.set(normalizedCity(route.destination.city), route.destination.city)
  }
  return [...destinations.values()].sort((a, b) => a.localeCompare(b))
}

export function routeForCityPair(routes: WebRouteDto[], origin: string, destination: string) {
  const normalizedOrigin = normalizedCity(origin)
  const normalizedDestination = normalizedCity(destination)
  return routes.find(
    (route) =>
      route.available &&
      normalizedCity(route.origin.city) === normalizedOrigin &&
      normalizedCity(route.destination.city) === normalizedDestination
  )
}

export function routeForOriginChange(
  routes: WebRouteDto[],
  currentRoute: WebRouteDto | undefined,
  origin: string
) {
  if (currentRoute) {
    const reversedCurrentRoute = routeForCityPair(
      routes,
      origin,
      currentRoute.origin.city
    )
    if (reversedCurrentRoute) return reversedCurrentRoute
  }

  const normalizedOrigin = normalizedCity(origin)
  return routes.find(
    (route) => route.available && normalizedCity(route.origin.city) === normalizedOrigin
  )
}

export function routeForSelection(
  routes: WebRouteDto[],
  routeId: string,
  origin: string,
  destination: string
) {
  if (routeId) {
    return routes.find((route) => route.available && route.id === routeId)
  }
  return routeForCityPair(routes, origin, destination)
}

export function isRouteEndpointCompatible(submittedCity: string, routeCity: string) {
  return normalizedCity(submittedCity) === normalizedCity(routeCity)
}
