import type { Prisma } from '@prisma/client'
import { routes as defaultRoutes, legacyRouteBorderFeeIds } from '@/data/routes'
import { prisma } from '@/lib/prisma'
import type { Route } from '@/types'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

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
}): Route {
  return {
    id: route.id,
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
  return routes.map(toDomainRoute)
}

export async function getPublicRouteById(routeId: string, client: PrismaClientLike = prisma) {
  const route = await client.route.findFirst({ where: { id: routeId, available: true } })
  return route ? toDomainRoute(route) : null
}

export async function findPublicRouteByCities(
  from: string,
  to: string,
  client: PrismaClientLike = prisma
) {
  const [fromCity, toCity] = [from.trim(), to.trim()]
  const route = await client.route.findFirst({
    where: {
      available: true,
      OR: [
        { from: { equals: fromCity, mode: 'insensitive' }, to: { equals: toCity, mode: 'insensitive' } },
        { from: { equals: toCity, mode: 'insensitive' }, to: { equals: fromCity, mode: 'insensitive' } },
      ],
    },
  })
  return route ? toDomainRoute(route) : null
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
