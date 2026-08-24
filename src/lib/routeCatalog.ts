import type { Prisma } from '@prisma/client'
import { routes as defaultRoutes, legacyRouteBorderFeeIds } from '@/data/routes'
import { prisma } from '@/lib/prisma'
import type { Route } from '@/types'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient
type PublicRoute = Route & {
  canonicalRouteId: string
  pricingRouteId: string
  sourceRouteId: string
  direction: 'explicit' | 'reverse_projection'
}

export async function ensureDefaultRoutes() {
  const existing = await prisma.route.findMany({ select: { id: true } })
  const existingIds = new Set(existing.map((route) => route.id))
  const missing = defaultRoutes.filter((route) => !existingIds.has(route.id))

  if (missing.length === 0) return

  await prisma.$transaction(
    missing.map((route) =>
      prisma.route.create({
        data: {
          id: route.id,
          from: route.from,
          fromCode: route.fromCode,
          fromCountry: route.fromCountry,
          to: route.to,
          toCode: route.toCode,
          toCountry: route.toCountry,
          durationHours: route.durationHours,
          popular: route.popular,
          available: route.available ?? true,
          image: route.image,
          description: route.description,
          descriptionFr: route.descriptionFr,
          borderCrossings: route.borderCrossings,
          borderFeeIds: legacyRouteBorderFeeIds[route.id] ?? [],
        },
      })
    )
  )
}

export function toDomainRoute(route: {
  id: string
  from: string
  fromCode: string | null
  fromCountry: string | null
  to: string
  toCode: string | null
  toCountry: string | null
  durationHours: number
  available?: boolean | null
  popular: boolean
  image: string | null
  description: string | null
  descriptionFr: string | null
  borderCrossings: string[]
  borderFeeIds?: string[] | null
}): PublicRoute {
  return {
    id: route.id,
    canonicalRouteId: route.id,
    pricingRouteId: route.id,
    sourceRouteId: route.id,
    direction: 'explicit',
    from: route.from,
    fromCode: route.fromCode ?? '',
    fromCountry: route.fromCountry ?? '',
    to: route.to,
    toCode: route.toCode ?? '',
    toCountry: route.toCountry ?? '',
    durationHours: route.durationHours,
    available: route.available ?? true,
    popular: route.popular,
    image: route.image ?? '',
    description: route.description ?? '',
    descriptionFr: route.descriptionFr ?? route.description ?? '',
    borderCrossings: route.borderCrossings,
    borderFeeIds: route.borderFeeIds ?? [],
  }
}

export async function getPublicRoutes(client: PrismaClientLike = prisma) {
  const routes = await client.route.findMany({
    where: { available: true },
    orderBy: [{ popular: 'desc' }, { from: 'asc' }, { to: 'asc' }],
  })
  return withReverseRouteProjections(routes.map(toDomainRoute))
}

export async function getPublicRouteById(routeId: string, client: PrismaClientLike = prisma) {
  const synthetic = parseReverseProjectionRouteId(routeId)
  if (synthetic) {
    const source = await client.route.findFirst({
      where: { id: synthetic.sourceRouteId, available: true },
    })
    if (!source) return null
    return reverseRouteProjection(toDomainRoute(source))
  }

  const route = await client.route.findFirst({ where: { id: routeId, available: true } })
  return route ? toDomainRoute(route) : null
}

export async function findPublicRouteByCities(
  from: string,
  to: string,
  client: PrismaClientLike = prisma
) {
  const [fromCity, toCity] = [from.trim(), to.trim()]
  const explicit = await client.route.findFirst({
    where: {
      available: true,
      from: { equals: fromCity, mode: 'insensitive' },
      to: { equals: toCity, mode: 'insensitive' },
    },
  })
  if (explicit) return toDomainRoute(explicit)

  const reverseSource = await client.route.findFirst({
    where: {
      available: true,
      from: { equals: toCity, mode: 'insensitive' },
      to: { equals: fromCity, mode: 'insensitive' },
    },
  })
  return reverseSource ? reverseRouteProjection(toDomainRoute(reverseSource)) : null
}

export async function getBookingLocations(client: PrismaClientLike = prisma) {
  const routes = await getPublicRoutes(client)
  const byCity = new Map<string, { city: string; country: string; code: string }>()
  for (const route of routes) {
    byCity.set(route.from.toLowerCase(), {
      city: route.from,
      country: route.fromCountry,
      code: route.fromCode,
    })
    byCity.set(route.to.toLowerCase(), {
      city: route.to,
      country: route.toCountry,
      code: route.toCode,
    })
  }
  return [...byCity.values()].sort((a, b) => a.city.localeCompare(b.city))
}

export function routePricingId(route: Pick<Route, 'id' | 'pricingRouteId'>) {
  return route.pricingRouteId ?? route.id
}

export function routeCanonicalId(route: Pick<Route, 'id' | 'canonicalRouteId'>) {
  return route.canonicalRouteId ?? route.id
}

export function reverseProjectionRouteId(sourceRouteId: string) {
  return `${sourceRouteId}__reverse`
}

export function parseReverseProjectionRouteId(routeId: string) {
  const suffix = '__reverse'
  if (!routeId.endsWith(suffix)) return null
  return { sourceRouteId: routeId.slice(0, -suffix.length) }
}

function cityPairKey(from: string, to: string) {
  return `${from.trim().toLowerCase()}→${to.trim().toLowerCase()}`
}

function withReverseRouteProjections(routes: PublicRoute[]) {
  const explicitPairs = new Set(routes.map((route) => cityPairKey(route.from, route.to)))
  const projections: PublicRoute[] = []

  for (const route of routes) {
    if (explicitPairs.has(cityPairKey(route.to, route.from))) continue
    projections.push(reverseRouteProjection(route))
  }

  return [...routes, ...projections]
}

function reverseRouteProjection(route: PublicRoute): PublicRoute {
  return {
    ...route,
    id: reverseProjectionRouteId(route.id),
    canonicalRouteId: routeCanonicalId(route),
    pricingRouteId: routePricingId(route),
    sourceRouteId: route.id,
    direction: 'reverse_projection',
    from: route.to,
    fromCode: route.toCode,
    fromCountry: route.toCountry,
    to: route.from,
    toCode: route.fromCode,
    toCountry: route.fromCountry,
    popular: false,
    description: `Private Beninfy transport from ${route.to} to ${route.from} on the supported ${route.from} to ${route.to} corridor.`,
    descriptionFr: `Transport privé Beninfy de ${route.to} à ${route.from} sur le corridor pris en charge ${route.from} - ${route.to}.`,
    borderCrossings: reverseBorderCrossings(route.borderCrossings),
    borderFeeIds: [...(route.borderFeeIds ?? [])].reverse(),
  }
}

export function reverseBorderCrossings(crossings: string[]) {
  return [...crossings].reverse().map(reverseBorderCrossingLabel)
}

function reverseBorderCrossingLabel(label: string) {
  const separator = label.includes('–') ? '–' : label.includes('-') ? '-' : null
  if (!separator) return label
  const parts = label.split(separator).map((part) => part.trim())
  if (parts.length !== 2 || !parts[0] || !parts[1]) return label
  return `${parts[1]}${separator}${parts[0]}`
}
