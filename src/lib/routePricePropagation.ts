import type { Prisma } from '@prisma/client'

type RoutePricePropagationInput = {
  routeId: string
  vehicleId: string
  pricingScope: string
  amountNGN: number
  notes?: string | null
}

export async function propagateCategoryRoutePrice(
  tx: Prisma.TransactionClient,
  { routeId, vehicleId, pricingScope, amountNGN, notes }: RoutePricePropagationInput
) {
  const category = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  })

  if (!category) return { propagated: 0 }

  const fleetUnits = await tx.fleetVehicle.findMany({
    where: { vehicleId },
    select: { id: true },
  })

  let propagated = 0

  for (const unit of fleetUnits) {
    const existing = await tx.routePrice.findFirst({
      where: {
        routeId,
        vehicleId: unit.id,
        pricingScope,
      },
      select: { id: true },
    })

    if (existing) {
      continue
    }

    await tx.routePrice.create({
      data: {
        routeId,
        vehicleId: unit.id,
        pricingScope,
        amountNGN,
        notes,
      },
    })
    propagated += 1
  }

  return { propagated }
}
