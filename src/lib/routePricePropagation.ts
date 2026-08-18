import type { Prisma } from '@prisma/client'

type RoutePricePropagationInput = {
  routeId: string
  vehicleId: string
  pricingScope: string
  amountNGN: number
  notes?: string | null
  syncFleetPrices?: boolean
}

export async function propagateCategoryRoutePrice(
  tx: Prisma.TransactionClient,
  { routeId, vehicleId, pricingScope, amountNGN, notes, syncFleetPrices = false }: RoutePricePropagationInput
) {
  const category = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  })

  if (!category) return { propagated: 0, updatedManaged: 0, updatedExplicit: 0 }

  const fleetUnits = await tx.fleetVehicle.findMany({
    where: { vehicleId },
    select: { id: true },
  })

  let propagated = 0
  let updatedManaged = 0
  let updatedExplicit = 0

  for (const unit of fleetUnits) {
    const existing = await tx.routePrice.findFirst({
      where: {
        routeId,
        vehicleId: unit.id,
        pricingScope,
      },
      select: { id: true, managedByCategory: true },
    })

    if (existing) {
      if (existing.managedByCategory || syncFleetPrices) {
        await tx.routePrice.update({
          where: { id: existing.id },
          data: {
            amountNGN,
            notes,
            managedByCategory: true,
          },
        })
        if (existing.managedByCategory) updatedManaged += 1
        else updatedExplicit += 1
      }
      continue
    }

    await tx.routePrice.create({
      data: {
        routeId,
        vehicleId: unit.id,
        pricingScope,
        amountNGN,
        notes,
        managedByCategory: true,
      },
    })
    propagated += 1
  }

  return { propagated, updatedManaged, updatedExplicit }
}
