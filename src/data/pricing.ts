import type { RouteId, VehicleId, PriceRange } from '@/types'

/**
 * Legacy route price seed/policy data.
 *
 * Runtime booking and mobile quote calculation must use database RoutePrice rows
 * through src/lib/bookingPricing.ts. The pickup-area requirement helpers remain
 * code-level policy until pickup zones become a backoffice-managed model.
 */
export type LagosPickupArea = 'mainland' | 'island'
export type RoutePriceScope = 'default' | LagosPickupArea
export type ScopedRoutePriceOverride = Partial<Record<RoutePriceScope, number>>
export type RoutePriceOverrideValue = number | ScopedRoutePriceOverride
export type RoutePriceOverrides = Record<string, Record<string, RoutePriceOverrideValue>>

const cotonouLomePricing: Partial<Record<VehicleId, number | PriceRange>> = {
  saloon: { min: 150_000, max: 160_000 },
  suv: 250_000,
  sienna: 240_000,
  prado: 300_000,
  gx460: 300_000,
  'lexus-gx460': 300_000,
  sprinter: 650_000,
  hiace: 700_000,
  coastal: 850_000,
}

const lomeAccraPricing: Partial<Record<VehicleId, number | PriceRange>> = {
  saloon: { min: 160_000, max: 170_000 },
  suv: 260_000,
  sienna: 250_000,
  prado: 450_000,
  gx460: 450_000,
  'lexus-gx460': 450_000,
  sprinter: 700_000,
  hiace: 750_000,
  coastal: 900_000,
}

const cotonouAccraPricing: Partial<Record<VehicleId, number | PriceRange>> = {
  saloon: 340_000,
  camry: 340_000,
  'toyota-camry': 340_000,
  'toyota-camry-sedan': 340_000,
  suv: 510_000,
  sienna: 510_000,
  prado: 750_000,
  gx460: 750_000,
  'lexus-gx460': 750_000,
}

/**
 * Official Beninfy one-way drop-off route pricing in Nigerian Naira (₦).
 * Round trips multiply this drop-off fare by two before fees.
 * Saloon prices shown as ranges (min/max); all other vehicles are fixed.
 * Opposite directions reference the same pricing object.
 */
export const routePricing: Record<RouteId, Partial<Record<VehicleId, number | PriceRange>>> = {
  'lagos-cotonou': {
    saloon:  { min: 160_000, max: 180_000 },
    camry:   { min: 160_000, max: 180_000 },
    'toyota-camry': { min: 160_000, max: 180_000 },
    'toyota-camry-sedan': { min: 160_000, max: 180_000 },
    suv:     260_000,
    sienna:  250_000,
    prado:   450_000,
    gx460:   450_000,
    'lexus-gx460': 450_000,
    sprinter: 700_000,
    hiace:   750_000,
    coastal: 900_000,
  },
  'lagos-porto-novo': {
    saloon:  { min: 160_000, max: 180_000 },
    camry:   { min: 160_000, max: 180_000 },
    'toyota-camry': { min: 160_000, max: 180_000 },
    'toyota-camry-sedan': { min: 160_000, max: 180_000 },
    suv:     260_000,
    sienna:  250_000,
    prado:   450_000,
    gx460:   450_000,
    'lexus-gx460': 450_000,
    sprinter: 700_000,
    hiace:   750_000,
    coastal: 900_000,
  },
  'lagos-ouidah': {
    saloon:  250_000,
    camry:   250_000,
    'toyota-camry': 250_000,
    'toyota-camry-sedan': 250_000,
    sienna:  300_000,
    suv:     300_000,
    prado:   450_000,
    gx460:   450_000,
    'lexus-gx460': 450_000,
  },
  'cotonou-togo': cotonouLomePricing,
  'lome-cotonou': cotonouLomePricing,
  'togo-ghana': lomeAccraPricing,
  'accra-lome': lomeAccraPricing,
  'cotonou-accra': cotonouAccraPricing,
  'accra-cotonou': cotonouAccraPricing,
  'lagos-togo': {
    saloon:  { min: 320_000, max: 330_000 },
    suv:     510_000,
    sienna:  490_000,
    prado:   520_000,
    sprinter: 1_350_000,
    hiace:   1_450_000,
    coastal: 1_750_000,
  },
  'lagos-aneho': {
    saloon:  { min: 320_000, max: 330_000 },
    suv:     520_000,
    sienna:  490_000,
    prado:   520_000,
    sprinter: 1_350_000,
    hiace:   1_450_000,
    coastal: 1_750_000,
  },
  'lagos-kpalime': {
    saloon:  450_000,
    camry:   450_000,
    'toyota-camry': 450_000,
    'toyota-camry-sedan': 450_000,
    sienna:  400_000,
    suv:     400_000,
    prado:   550_000,
    gx460:   550_000,
    'lexus-gx460': 550_000,
  },
  'lagos-ghana': {
    saloon:  { min: 470_000, max: 480_000 },
    suv:     770_000,
    sienna:  740_000,
    prado:   770_000,
    sprinter: 2_050_000,
    hiace:   2_200_000,
    coastal: 2_650_000,
  },
}

/** Daily tour-use rate per vehicle (₦/day) */
export const tourDailyRates: Partial<Record<VehicleId, number>> = {
  saloon:  105_000,
  suv:     160_000,
  sienna:  150_000,
  prado:   160_000,
  sprinter: 310_000,
  hiace:   210_000,
  coastal: 260_000,
}

/** 1.5-day all-inclusive transport + tour packages (₦) */
export const packageRates: Partial<Record<VehicleId, number>> = {
  saloon:  500_000,
  suv:     800_000,
  sienna:  800_000,
  prado:   1_100_000,
  sprinter: 1_600_000,
  hiace:   1_500_000,
  coastal: 2_000_000,
}

/** Returns the price for a given route + vehicle combination */
export function getRoutePrice(
  routeId: RouteId,
  vehicleId: VehicleId,
  vehicleName?: string,
  overrides?: RoutePriceOverrides
): number | PriceRange | null {
  const overridePrice = getRoutePriceOverride(routeId, vehicleId, vehicleName, overrides)
  if (overridePrice !== null) return overridePrice

  const pricing = routePricing[routeId]
  if (!pricing) return null

  const directPrice = pricing[vehicleId]
  if (directPrice) return directPrice

  const alias = resolveVehiclePricingAlias(vehicleId, vehicleName)
  if (alias && pricing[alias]) return pricing[alias] ?? null

  return null
}

/**
 * Returns the one-way drop-off fare for a route + vehicle.
 * If a fare is a range, the lower end is used for system calculations.
 */
export function getRouteDropoffPrice(
  routeId: RouteId,
  vehicleId: VehicleId,
  vehicleName?: string,
  pickupArea?: LagosPickupArea,
  overrides?: RoutePriceOverrides
): number | null {
  const overridePrice = getRoutePriceOverride(routeId, vehicleId, vehicleName, overrides, pickupArea)
  if (typeof overridePrice === 'number') return overridePrice
  if (overridePrice) return overridePrice.min

  const lagosPickupPrice = getLagosSaloonPickupPrice(routeId, vehicleId, vehicleName, pickupArea)
  if (lagosPickupPrice) return lagosPickupPrice

  const price = getRoutePrice(routeId, vehicleId, vehicleName)
  if (!price) return null
  if (typeof price === 'object') return price.min
  return price
}

export function getRoutePriceOverride(
  routeId: RouteId,
  vehicleId: VehicleId,
  vehicleName?: string,
  overrides?: RoutePriceOverrides,
  pickupArea?: LagosPickupArea
) {
  const routeOverrides = overrides?.[routeId]
  if (!routeOverrides) return null
  const directPrice = resolveScopedOverride(routeOverrides[vehicleId], pickupArea)
  if (directPrice !== null) return directPrice

  const alias = resolveVehiclePricingAlias(vehicleId, vehicleName)
  if (alias) {
    const aliasPrice = resolveScopedOverride(routeOverrides[alias], pickupArea)
    if (aliasPrice !== null) return aliasPrice
  }

  return null
}

function resolveScopedOverride(value: RoutePriceOverrideValue | undefined, pickupArea?: LagosPickupArea): number | PriceRange | null {
  if (typeof value === 'number') return value
  if (!value) return null

  if (pickupArea && typeof value[pickupArea] === 'number') return value[pickupArea]
  if (typeof value.default === 'number') return value.default

  const scopedPrices = [value.mainland, value.island].filter((price): price is number => typeof price === 'number')
  if (scopedPrices.length === 0) return null
  return { min: Math.min(...scopedPrices), max: Math.max(...scopedPrices) }
}

export function requiresLagosPickupArea(routeId: RouteId, vehicleId: VehicleId, vehicleName?: string): boolean {
  return (
    (routeId === 'lagos-cotonou' || routeId === 'lagos-porto-novo') &&
    resolveVehiclePricingAlias(vehicleId, vehicleName) === 'saloon'
  )
}

function getLagosSaloonPickupPrice(routeId: RouteId, vehicleId: VehicleId, vehicleName?: string, pickupArea?: LagosPickupArea) {
  if (!pickupArea || !requiresLagosPickupArea(routeId, vehicleId, vehicleName)) return null
  return pickupArea === 'mainland' ? 160_000 : 180_000
}

function normalizeVehicleText(value: string | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function resolveVehiclePricingAlias(vehicleId: VehicleId, vehicleName?: string): VehicleId | null {
  const text = `${normalizeVehicleText(vehicleId)} ${normalizeVehicleText(vehicleName)}`

  if (text.includes('gx460') || text.includes('lexusgx') || text.includes('lexus460')) {
    return 'prado'
  }

  if (text.includes('camry') || text.includes('sedan') || text.includes('saloon')) {
    return 'saloon'
  }

  if (text.includes('sienna')) return 'sienna'
  if (text.includes('prado')) return 'prado'
  if (text.includes('rav4') || text.includes('highlander') || text.includes('suv')) return 'suv'
  if (text.includes('sprinter')) return 'sprinter'
  if (text.includes('hiace')) return 'hiace'
  if (text.includes('coastal') || text.includes('coaster')) return 'coastal'

  return null
}

/**
 * Returns the starting (minimum) price for a route.
 * Defaults to saloon car base price.
 */
export function getRouteBasePrice(routeId: RouteId): number {
  const price = getRoutePrice(routeId, 'saloon')
  if (!price) return 0
  if (typeof price === 'object') return price.min
  return price
}

/** Formats a price or range as a display string, e.g. "₦160,000" or "₦160,000–₦170,000" */
export function formatPriceRange(price: number | PriceRange): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
  if (typeof price === 'number') return fmt(price)
  return `${fmt(price.min)}\u2013${fmt(price.max)}`
}
