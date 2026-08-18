import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { routes, legacyRouteBorderFeeIds } from '../src/data/routes'
import { borderFees } from '../src/data/borderFees'
import { routePricing, requiresLagosPickupArea } from '../src/data/pricing'
import { vehicles } from '../src/data/vehicles'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const summary = {
    routesCreated: 0,
    routesPreserved: 0,
    routeBorderFeeIdsBackfilled: 0,
    borderFeesCreated: 0,
    borderFeesPreserved: 0,
    routePricesCreated: 0,
    routePricesPreserved: 0,
  }

  for (const fee of borderFees) {
    const existing = await prisma.borderFee.findUnique({ where: { id: fee.id } })
    if (existing) {
      summary.borderFeesPreserved += 1
      continue
    }
    await prisma.borderFee.create({
      data: {
        id: fee.id,
        country: fee.country,
        countryFr: fee.countryFr,
        border: fee.border,
        borderFr: fee.borderFr,
        countries: fee.countries,
        feePerPersonNGN: fee.feePerPersonNGN,
        feeRoundTripNGN: fee.feeRoundTripNGN,
        popular: fee.popular ?? false,
        icon: fee.icon,
        services: fee.services,
        servicesFr: fee.servicesFr,
        documents: fee.documents,
        documentsFr: fee.documentsFr,
        tips: fee.tips,
        tipsFr: fee.tipsFr,
      },
    })
    summary.borderFeesCreated += 1
  }

  for (const route of routes) {
    const existing = await prisma.route.findUnique({ where: { id: route.id } })
    if (existing) {
      summary.routesPreserved += 1
      if ((existing.borderFeeIds?.length ?? 0) === 0) {
        const ids = legacyRouteBorderFeeIds[route.id] ?? []
        if (ids.length > 0) {
          await prisma.route.update({ where: { id: route.id }, data: { borderFeeIds: ids } })
          summary.routeBorderFeeIdsBackfilled += 1
        }
      }
      continue
    }
    await prisma.route.create({
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
    summary.routesCreated += 1
  }

  for (const route of routes) {
    const pricing = routePricing[route.id]
    if (!pricing) continue
    for (const vehicle of vehicles) {
      const scopes = requiresLagosPickupArea(route.id, vehicle.id, vehicle.name)
        ? (['mainland', 'island'] as const)
        : (['default'] as const)
      for (const scope of scopes) {
        const amountNGN = amountFor(route.id, vehicle.id, vehicle.name, scope)
        if (!amountNGN) continue
        const existing = await prisma.routePrice.findFirst({
          where: { routeId: route.id, vehicleId: vehicle.id, pricingScope: scope },
          select: { id: true },
        })
        if (existing) {
          summary.routePricesPreserved += 1
          continue
        }
        await prisma.routePrice.create({
          data: {
            routeId: route.id,
            vehicleId: vehicle.id,
            pricingScope: scope,
            amountNGN,
            notes: 'Imported once from legacy operational price table; DB is authoritative after import.',
          },
        })
        summary.routePricesCreated += 1
      }
    }
  }

  console.info('Operational catalog import complete:', summary)
}

function amountFor(routeId: string, vehicleId: string, vehicleName: string, scope: 'default' | 'mainland' | 'island') {
  if (
    (routeId === 'lagos-cotonou' || routeId === 'lagos-porto-novo') &&
    (vehicleId === 'saloon' || vehicleName.toLowerCase().includes('camry'))
  ) {
    return scope === 'island' ? 180_000 : 160_000
  }
  const price = routePricing[routeId]?.[vehicleId]
  if (!price) return null
  return typeof price === 'number' ? price : price.min
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
