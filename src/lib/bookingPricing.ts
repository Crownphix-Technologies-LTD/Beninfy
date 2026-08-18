import type { Prisma } from '@prisma/client'
import {
  getRouteDropoffPrice as getLegacyRouteDropoffPrice,
  requiresLagosPickupArea,
  type LagosPickupArea,
  type RoutePriceScope,
} from '@/data/pricing'
import { calculateRouteBorderFeeNGN } from '@/lib/borderFeeCatalog'
import { prisma } from '@/lib/prisma'
import type { TripType } from '@/types'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

export type BookingPricingInput = {
  routeId: string
  tripType: TripType
  vehicleId: string
  vehicleName: string
  fleetVehicleId?: string | null
  fleetVehicleLabel?: string | null
  pickupArea?: LagosPickupArea
  client?: PrismaClientLike
}

export type BookingPricingResult =
  | {
      ok: true
      routeId: string
      pricingTargetId: string
      pricingTargetName: string
      pricingScope: RoutePriceScope
      oneWayDropoffFare: number
      legCount: number
      rideFareNGN: number
      borderFeeNGN: number
      subtotalNGN: number
      source: 'database' | 'legacy-static'
    }
  | {
      ok: false
      code:
        | 'PICKUP_AREA_REQUIRED'
        | 'PRICE_NOT_CONFIGURED'
        | 'BORDER_FEE_NOT_CONFIGURED'
        | 'ROUTE_NOT_FOUND'
      message: string
      details?: unknown
    }

export function calculateFareBreakdown(input: {
  oneWayDropoffFare: number
  tripType: TripType
  borderFeeNGN: number
}) {
  const legCount = input.tripType === 'round-trip' ? 2 : 1
  const rideFareNGN = input.oneWayDropoffFare * legCount
  const subtotalNGN = rideFareNGN + input.borderFeeNGN

  return {
    oneWayDropoffFare: input.oneWayDropoffFare,
    legCount,
    rideFareNGN,
    borderFeeNGN: input.borderFeeNGN,
    subtotalNGN,
  }
}

export async function calculateBookingPricing(
  input: BookingPricingInput
): Promise<BookingPricingResult> {
  const client = input.client ?? prisma
  const pricingTargetId = input.fleetVehicleId ?? input.vehicleId
  const pricingTargetName = input.fleetVehicleLabel ?? input.vehicleName
  const needsPickupArea = requiresLagosPickupArea(
    input.routeId,
    pricingTargetId,
    pricingTargetName
  )

  if (needsPickupArea && !input.pickupArea) {
    return {
      ok: false,
      code: 'PICKUP_AREA_REQUIRED',
      message: 'Pickup fare zone is required for this route and vehicle',
    }
  }

  const pricingScope = normalizePricingScope(input.pickupArea)
  const price = await lookupDatabaseDropoffFare({
    client,
    routeId: input.routeId,
    vehicleId: input.vehicleId,
    fleetVehicleId: input.fleetVehicleId,
    pricingScope,
  })

  let oneWayDropoffFare = price?.amountNGN ?? null
  let source: 'database' | 'legacy-static' = 'database'

  if (oneWayDropoffFare === null && legacyStaticPricingFallbackEnabled()) {
    console.warn('Using legacy static pricing fallback', {
      routeId: input.routeId,
      vehicleId: input.vehicleId,
      fleetVehicleId: input.fleetVehicleId,
      pricingScope,
    })
    oneWayDropoffFare = getLegacyRouteDropoffPrice(
      input.routeId,
      pricingTargetId,
      pricingTargetName,
      input.pickupArea
    )
    source = 'legacy-static'
  }

  if (oneWayDropoffFare === null) {
    return {
      ok: false,
      code: 'PRICE_NOT_CONFIGURED',
      message: 'Fare quote is unavailable for this route and vehicle',
    }
  }

  const borderFee = await calculateRouteBorderFeeNGN({
    routeId: input.routeId,
    tripType: input.tripType,
    client,
  })
  if (!borderFee.ok) {
    return {
      ok: false,
      code: borderFee.code,
      message:
        borderFee.code === 'ROUTE_NOT_FOUND'
          ? 'Route not found'
          : 'Border fee is not configured for this route',
      details: 'missing' in borderFee ? borderFee.missing : undefined,
    }
  }

  return {
    ok: true,
    routeId: input.routeId,
    pricingTargetId,
    pricingTargetName,
    pricingScope,
    source,
    ...calculateFareBreakdown({
      oneWayDropoffFare,
      tripType: input.tripType,
      borderFeeNGN: borderFee.amountNGN,
    }),
  }
}

export async function getRouteStartingPriceNGN(routeId: string, client: PrismaClientLike = prisma) {
  const row = await client.routePrice.findFirst({
    where: {
      routeId,
      pricingScope: { in: ['default', 'mainland', 'island'] },
    },
    orderBy: { amountNGN: 'asc' },
    select: { amountNGN: true },
  })
  return row?.amountNGN ?? null
}

async function lookupDatabaseDropoffFare(input: {
  client: PrismaClientLike
  routeId: string
  vehicleId: string
  fleetVehicleId?: string | null
  pricingScope: RoutePriceScope
}) {
  const scopes = input.pricingScope === 'default' ? ['default'] : [input.pricingScope, 'default']
  const targetIds = input.fleetVehicleId
    ? [input.fleetVehicleId, input.vehicleId]
    : [input.vehicleId]

  const rows = await input.client.routePrice.findMany({
    where: {
      routeId: input.routeId,
      vehicleId: { in: targetIds },
      pricingScope: { in: scopes },
    },
    select: { vehicleId: true, pricingScope: true, amountNGN: true },
  })

  for (const vehicleId of targetIds) {
    for (const scope of scopes) {
      const match = rows.find((row) => row.vehicleId === vehicleId && row.pricingScope === scope)
      if (match) return match
    }
  }

  return null
}

function normalizePricingScope(pickupArea?: LagosPickupArea): RoutePriceScope {
  return pickupArea === 'mainland' || pickupArea === 'island' ? pickupArea : 'default'
}

function legacyStaticPricingFallbackEnabled() {
  return process.env.ALLOW_LEGACY_STATIC_PRICING_FALLBACK === 'true'
}
