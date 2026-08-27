import { routes as defaultRoutes } from '@/data/routes'
import { getRouteDropoffPrice, getRoutePrice, requiresLagosPickupArea, type RoutePriceScope } from '@/data/pricing'
import type { RouteId, VehicleId } from '@/types'
import { ensureDefaultRoutes } from '@/lib/routeCatalog'
import { ensureDefaultVehicles } from '@/lib/vehicleCatalog'

type RoutePriceSeed = {
  routeId: string
  vehicleId: string
  pricingScope: RoutePriceScope
  amountNGN: number
}

export async function ensureDefaultRoutePrices() {
  const { prisma } = await import('@/lib/prisma')

  await ensureDefaultRoutes()
  await ensureDefaultVehicles()

  const [vehicles, fleetVehicles, existing] = await Promise.all([
    prisma.vehicle.findMany({ select: { id: true, name: true } }),
    prisma.fleetVehicle.findMany({ select: { id: true, vehicleId: true, label: true } }),
    prisma.routePrice.findMany({ select: { routeId: true, vehicleId: true, pricingScope: true } }),
  ])

  const existingKeys = new Set(
    existing.map((price) => priceKey(price.routeId, price.vehicleId, normalizeScope(price.pricingScope)))
  )

  const categoryPrices: RoutePriceSeed[] = defaultRoutes.flatMap((route) => {
    return vehicles.flatMap<RoutePriceSeed>((vehicle) => {
      const routeId = route.id as RouteId
      const vehicleId = vehicle.id as VehicleId

      const defaultAmountNGN = fixedRouteAmount(routeId, vehicleId, vehicle.name)
      const defaultSeed: RoutePriceSeed[] =
        defaultAmountNGN && !existingKeys.has(priceKey(route.id, vehicle.id, 'default'))
          ? [
              {
                routeId: route.id,
                vehicleId: vehicle.id,
                pricingScope: 'default',
                amountNGN: defaultAmountNGN,
              },
            ]
          : []

      if (requiresLagosPickupArea(routeId, vehicleId, vehicle.name)) {
        const scopedSeeds = (['mainland', 'island'] as const).flatMap((scope) => {
          const amountNGN = getRouteDropoffPrice(routeId, vehicleId, vehicle.name, scope)
          if (!amountNGN || existingKeys.has(priceKey(route.id, vehicle.id, scope))) return []
          return [{ routeId: route.id, vehicleId: vehicle.id, pricingScope: scope, amountNGN }]
        })
        return [...defaultSeed, ...scopedSeeds]
      }

      return defaultSeed
    })
  })

  const fleetUnitPrices: RoutePriceSeed[] = defaultRoutes.flatMap((route) => {
    return fleetVehicles.flatMap<RoutePriceSeed>((unit) => {
      const routeId = route.id as RouteId
      const vehicleId = unit.id as VehicleId
      const amountNGN = fixedRouteAmount(routeId, vehicleId, unit.label)
      if (!amountNGN || existingKeys.has(priceKey(route.id, unit.id, 'default'))) return []
      return [{ routeId: route.id, vehicleId: unit.id, pricingScope: 'default' as const, amountNGN }]
    })
  })

  const missingPrices = [...categoryPrices, ...fleetUnitPrices]

  if (missingPrices.length === 0) return { created: 0 }

  const result = await prisma.routePrice.createMany({
    data: missingPrices.map((price) => ({
      ...price,
      notes: 'Default price seeded from Beninfy route table',
    })),
    skipDuplicates: true,
  })

  return { created: result.count }
}

function fixedRouteAmount(routeId: RouteId, vehicleId: VehicleId, vehicleName: string) {
  const price = getRoutePrice(routeId, vehicleId, vehicleName)
  if (!price) return null
  if (typeof price === 'number') return price
  return price.min
}

function normalizeScope(scope: string | null | undefined): RoutePriceScope {
  return scope === 'mainland' || scope === 'island' ? scope : 'default'
}

function priceKey(routeId: string, vehicleId: string, scope: RoutePriceScope) {
  return `${routeId}:${vehicleId}:${scope}`
}
