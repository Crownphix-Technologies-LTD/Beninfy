import { z } from 'zod'
import { routes, bookingCities, findRoute } from '@/data/routes'
import { vehicles as catalogVehicles } from '@/data/vehicles'
import {
  getRouteDropoffPrice,
  requiresLagosPickupArea,
  type LagosPickupArea,
} from '@/data/pricing'
import { getRouteBorderFee } from '@/data/borderFees'
import { prisma } from '@/lib/prisma'
import { getPublicVehicles } from '@/lib/vehicleCatalog'
import { getRoutePriceOverrides } from '@/lib/routePriceOverrides'
import { getAvailableFleetVehicleCount, assertFleetVehicleAvailable } from '@/lib/availability'
import { validateCouponCode, normalizeCouponCode } from '@/lib/coupons'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import type { Prisma } from '@prisma/client'
import type { Route, RouteId, TripType, Vehicle, VehicleId } from '@/types'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

export type MobileMoneyDto = {
  currency: 'NGN'
  value: number
  minorUnit: 'kobo'
  minorValue: number
  formatted: string
}

export const mobileDiscoverySelectionSchema = z.object({
  routeId: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  vehicleId: z.string().trim().min(1),
  fleetVehicleId: z.string().trim().optional().nullable(),
  tripType: z.enum(['one-way', 'round-trip']).default('one-way'),
  departureDate: z.string().trim().optional(),
  date: z.string().trim().optional(),
  returnDate: z.string().trim().optional().nullable(),
  passengers: z.number().int().positive().max(50).default(1),
  pickupArea: z.enum(['mainland', 'island']).optional(),
  couponCode: z.string().trim().optional().nullable(),
})

export type MobileDiscoverySelectionInput = z.input<typeof mobileDiscoverySelectionSchema>
export type MobileDiscoverySelection = z.output<typeof mobileDiscoverySelectionSchema>

export type MobileDiscoveryResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: MobileErrorCode; message: string; details?: unknown }

type FleetVehicleSafe = {
  id: string
  vehicleId: string
  label: string
  displayName: string
  color: string | null
  currentCity: string | null
  status: string
}

export function mobileMoney(value: number): MobileMoneyDto {
  return {
    currency: 'NGN',
    value,
    minorUnit: 'kobo',
    minorValue: value * 100,
    formatted: new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(value),
  }
}

export function toMobileRouteDto(route: Route) {
  return {
    id: route.id,
    origin: {
      city: route.from,
      code: route.fromCode,
      country: route.fromCountry,
    },
    destination: {
      city: route.to,
      code: route.toCode,
      country: route.toCountry,
    },
    displayName: `${route.from} to ${route.to}`,
    durationHours: route.durationHours,
    popular: route.popular,
    image: route.image,
    description: route.description,
    descriptionFr: route.descriptionFr,
    borderCrossings: route.borderCrossings,
    available: true,
  }
}

export function toMobileVehicleDto(vehicle: Vehicle) {
  return {
    id: vehicle.id,
    name: vehicle.name,
    nameFr: vehicle.nameFr,
    displayName: vehicle.name,
    capacity: vehicle.capacity,
    luggageCapacity: vehicle.luggageCapacity,
    available: vehicle.available,
    image: vehicle.image,
    description: vehicle.description,
    descriptionFr: vehicle.descriptionFr,
    features: vehicle.features,
    featuresFr: vehicle.featuresFr,
    badge: vehicle.badge ?? null,
    badgeFr: vehicle.badgeFr ?? null,
    basePrice: typeof vehicle.basePriceNGN === 'number' ? mobileMoney(vehicle.basePriceNGN) : null,
  }
}

export async function mobileRoutesCatalogue() {
  return {
    routes: routes.map(toMobileRouteDto),
    locations: bookingCities.map((city) => ({
      city: city.city,
      country: city.country,
    })),
  }
}

export function mobileRouteDetail(routeId: string) {
  const route = routes.find((item) => item.id === routeId)
  if (!route) return null
  return toMobileRouteDto(route)
}

export async function mobileVehiclesCatalogue() {
  const vehicles = await getPublicVehicles({ availableOnly: true })
  return { vehicles: vehicles.map(toMobileVehicleDto) }
}

export function normalizeDiscoverySelection(
  input: MobileDiscoverySelectionInput
): MobileDiscoveryResult<{
  selection: MobileDiscoverySelection
  route: Route
  departureDate: Date
  returnDate: Date | null
  datesToCheck: Date[]
}> {
  const parsed = mobileDiscoverySelectionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid booking discovery selection',
      details: parsed.error.flatten(),
    }
  }

  const selection = parsed.data
  const route = resolveRoute(selection)
  if (!route) return { ok: false, code: 'ROUTE_NOT_FOUND', message: 'Route not found' }

  const departureDateValue = selection.departureDate ?? selection.date
  if (!departureDateValue) {
    return { ok: false, code: 'INVALID_TRIP_DATES', message: 'Departure date is required' }
  }

  const departureDate = parseTripDate(departureDateValue)
  if (!departureDate) {
    return { ok: false, code: 'INVALID_TRIP_DATES', message: 'Departure date is invalid' }
  }

  let returnDate: Date | null = null
  if (selection.tripType === 'round-trip') {
    if (!selection.returnDate) {
      return {
        ok: false,
        code: 'INVALID_RETURN_DATE',
        message: 'Return date is required for round trips',
      }
    }
    returnDate = parseTripDate(selection.returnDate)
    if (!returnDate) {
      return { ok: false, code: 'INVALID_RETURN_DATE', message: 'Return date is invalid' }
    }
    if (returnDate < departureDate) {
      return {
        ok: false,
        code: 'INVALID_RETURN_DATE',
        message: 'Return date must be the same day or after the departure date',
      }
    }
  }

  return {
    ok: true,
    data: {
      selection,
      route,
      departureDate,
      returnDate,
      datesToCheck: returnDate ? [departureDate, returnDate] : [departureDate],
    },
  }
}

export async function calculateMobileAvailability(
  input: MobileDiscoverySelectionInput,
  client: PrismaClientLike = prisma
) {
  const normalized = normalizeDiscoverySelection(input)
  if (!normalized.ok) return normalized

  const vehicle = await resolveVehicle(normalized.data.selection.vehicleId, client)
  if (!vehicle) return { ok: false as const, code: 'VEHICLE_NOT_FOUND' as const, message: 'Vehicle not found' }
  if (!vehicle.available) {
    return {
      ok: false as const,
      code: 'VEHICLE_NOT_AVAILABLE' as const,
      message: 'Vehicle is not available for booking',
    }
  }

  if (normalized.data.selection.passengers > vehicle.capacity) {
    return {
      ok: false as const,
      code: 'VEHICLE_NOT_AVAILABLE' as const,
      message: `${vehicle.name} can carry up to ${vehicle.capacity} passengers`,
    }
  }

  const fleetVehicle = await resolveFleetVehicle(
    normalized.data.selection.fleetVehicleId,
    vehicle.id,
    client
  )
  if (fleetVehicle?.ok === false) return fleetVehicle

  const availability = fleetVehicle
    ? await selectedFleetAvailability(
        fleetVehicle.data,
        vehicle.id,
        normalized.data.datesToCheck,
        client
      )
    : await categoryAvailability(vehicle.id, normalized.data.datesToCheck, client)

  return {
    ok: true as const,
    data: {
      route: toMobileRouteDto(normalized.data.route),
      vehicle: toMobileVehicleDto(vehicle),
      fleetVehicle: fleetVehicle?.data ? toMobileFleetVehicleDto(fleetVehicle.data) : null,
      tripType: normalized.data.selection.tripType,
      departureDate: normalized.data.departureDate.toISOString(),
      returnDate: normalized.data.returnDate?.toISOString() ?? null,
      passengers: normalized.data.selection.passengers,
      availability,
      informationalOnly: true,
    },
  }
}

export async function calculateMobileQuote(
  input: MobileDiscoverySelectionInput,
  client: PrismaClientLike = prisma
) {
  const availabilityResult = await calculateMobileAvailability(input, client)
  if (!availabilityResult.ok) return availabilityResult

  const normalized = normalizeDiscoverySelection(input)
  if (!normalized.ok) return normalized

  const vehicle = await resolveVehicle(normalized.data.selection.vehicleId, client)
  if (!vehicle) return { ok: false as const, code: 'VEHICLE_NOT_FOUND' as const, message: 'Vehicle not found' }

  const fleetVehicle = normalized.data.selection.fleetVehicleId
    ? await client.fleetVehicle.findUnique({
        where: { id: normalized.data.selection.fleetVehicleId },
        select: {
          id: true,
          vehicleId: true,
          label: true,
          color: true,
          currentCity: true,
          status: true,
        },
      })
    : null

  const pricingTargetId = fleetVehicle?.id ?? vehicle.id
  const pricingTargetName = fleetVehicle?.label ?? vehicle.name

  if (
    requiresLagosPickupArea(
      normalized.data.route.id,
      pricingTargetId,
      pricingTargetName
    ) &&
    !normalized.data.selection.pickupArea
  ) {
    return {
      ok: false as const,
      code: 'PICKUP_AREA_REQUIRED' as const,
      message: 'Pickup fare zone is required for this route and vehicle',
    }
  }

  const routePriceOverrides = await getRoutePriceOverrides(normalized.data.route.id)
  const oneWayDropoffFare = getRouteDropoffPrice(
    normalized.data.route.id as RouteId,
    pricingTargetId as VehicleId,
    pricingTargetName,
    normalized.data.selection.pickupArea as LagosPickupArea | undefined,
    routePriceOverrides
  )

  if (oneWayDropoffFare === null) {
    return {
      ok: false as const,
      code: 'QUOTE_UNAVAILABLE' as const,
      message: 'Fare quote is unavailable for this route and vehicle',
    }
  }

  const fare = calculateFareBreakdown({
    oneWayDropoffFare,
    tripType: normalized.data.selection.tripType,
    borderFeeNGN: getRouteBorderFee(
      normalized.data.route.id as RouteId,
      normalized.data.selection.tripType as TripType
    ),
  })

  const couponCode = normalized.data.selection.couponCode
    ? normalizeCouponCode(normalized.data.selection.couponCode)
    : null
  const coupon = couponCode ? await validateCouponCode(couponCode, fare.subtotalNGN, client) : null
  if (coupon && !coupon.ok) {
    return {
      ok: false as const,
      code: couponErrorCode(coupon.error),
      message: coupon.error,
    }
  }

  const discountNGN = coupon?.ok ? coupon.discountNGN : 0
  const totalNGN = Math.max(0, fare.subtotalNGN - discountNGN)

  return {
    ok: true as const,
    data: {
      quote: {
        route: availabilityResult.data.route,
        vehicle: availabilityResult.data.vehicle,
        fleetVehicle: availabilityResult.data.fleetVehicle,
        tripType: normalized.data.selection.tripType,
        departureDate: normalized.data.departureDate.toISOString(),
        returnDate: normalized.data.returnDate?.toISOString() ?? null,
        passengers: normalized.data.selection.passengers,
        pickupArea: normalized.data.selection.pickupArea ?? null,
        currency: 'NGN' as const,
        pricing: {
          oneWayDropoffFare: mobileMoney(fare.oneWayDropoffFare),
          legCount: fare.legCount,
          rideFare: mobileMoney(fare.rideFareNGN),
          borderFees: mobileMoney(fare.borderFeeNGN),
          subtotal: mobileMoney(fare.subtotalNGN),
          discount: mobileMoney(discountNGN),
          total: mobileMoney(totalNGN),
        },
        coupon:
          coupon?.ok && couponCode
            ? {
                code: coupon.coupon.code,
                description: coupon.coupon.description,
                discountType: coupon.coupon.discountType,
                discount: mobileMoney(coupon.discountNGN),
              }
            : null,
        availability: availabilityResult.data.availability,
        informationalOnly: true,
      },
    },
  }
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

function resolveRoute(selection: MobileDiscoverySelection) {
  if (selection.routeId) return routes.find((route) => route.id === selection.routeId) ?? null
  if (selection.from && selection.to) return findRoute(selection.from, selection.to) ?? null
  return null
}

function parseTripDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function resolveVehicle(vehicleId: string, client: PrismaClientLike): Promise<Vehicle | null> {
  const dbVehicle = await client.vehicle.findUnique({ where: { id: vehicleId } })
  if (dbVehicle) {
    return {
      id: dbVehicle.id,
      name: dbVehicle.name,
      nameFr: dbVehicle.nameFr ?? dbVehicle.name,
      capacity: dbVehicle.capacity,
      luggageCapacity: dbVehicle.luggageCapacity,
      features: dbVehicle.features,
      featuresFr: dbVehicle.featuresFr,
      image: dbVehicle.image ?? '',
      description: dbVehicle.description ?? '',
      descriptionFr: dbVehicle.descriptionFr ?? dbVehicle.description ?? '',
      available: dbVehicle.available,
      basePriceNGN: dbVehicle.basePriceNGN,
      badge: dbVehicle.badge ?? undefined,
      badgeFr: dbVehicle.badgeFr ?? undefined,
    }
  }

  return catalogVehicles.find((vehicle) => vehicle.id === vehicleId) ?? null
}

async function resolveFleetVehicle(
  fleetVehicleId: string | null | undefined,
  vehicleId: string,
  client: PrismaClientLike
): Promise<MobileDiscoveryResult<FleetVehicleSafe> | null> {
  if (!fleetVehicleId) return null

  const fleetVehicle = await client.fleetVehicle.findUnique({
    where: { id: fleetVehicleId },
    select: {
      id: true,
      vehicleId: true,
      label: true,
      color: true,
      currentCity: true,
      status: true,
    },
  })

  if (!fleetVehicle || fleetVehicle.vehicleId !== vehicleId) {
    return {
      ok: false,
      code: 'VEHICLE_NOT_FOUND',
      message: 'Selected fleet unit does not belong to this vehicle category',
    }
  }

  return { ok: true, data: toFleetVehicleSafe(fleetVehicle) }
}

async function selectedFleetAvailability(
  fleetVehicle: FleetVehicleSafe,
  vehicleId: string,
  datesToCheck: Date[],
  client: PrismaClientLike
) {
  const checks = await Promise.all(
    datesToCheck.map(async (date) => {
      const result = await assertFleetVehicleAvailable(fleetVehicle.id, vehicleId, [date], client)
      return {
        date: date.toISOString(),
        physicalFleetCount: 1,
        availableCount: result.ok ? 1 : 0,
        available: result.ok,
        message: result.ok ? null : result.error,
      }
    })
  )
  const available = checks.every((check) => check.available)

  return {
    status: available ? 'available' : 'unavailable',
    available,
    availableCount: available ? 1 : 0,
    physicalFleetCount: 1,
    dates: checks,
  }
}

async function categoryAvailability(vehicleId: string, datesToCheck: Date[], client: PrismaClientLike) {
  const checks = await Promise.all(
    datesToCheck.map(async (date) => {
      const availability = await getAvailableFleetVehicleCount(vehicleId, date, client)
      return {
        date: date.toISOString(),
        physicalFleetCount: availability.physicalFleetCount,
        availableCount: availability.availableCount,
        available: availability.availableCount > 0,
      }
    })
  )
  const availableCount = Math.min(...checks.map((check) => check.availableCount))
  const physicalFleetCount = Math.min(...checks.map((check) => check.physicalFleetCount))
  const available = checks.every((check) => check.available)

  return {
    status: available ? 'available' : 'unavailable',
    available,
    availableCount,
    physicalFleetCount,
    dates: checks,
  }
}

function toFleetVehicleSafe(fleetVehicle: {
  id: string
  vehicleId: string
  label: string
  color: string | null
  currentCity: string | null
  status: string
}): FleetVehicleSafe {
  return {
    id: fleetVehicle.id,
    vehicleId: fleetVehicle.vehicleId,
    label: fleetVehicle.label,
    displayName: fleetVehicle.label,
    color: fleetVehicle.color,
    currentCity: fleetVehicle.currentCity,
    status: fleetVehicle.status,
  }
}

function toMobileFleetVehicleDto(fleetVehicle: FleetVehicleSafe) {
  return {
    id: fleetVehicle.id,
    vehicleId: fleetVehicle.vehicleId,
    displayName: fleetVehicle.displayName,
    color: fleetVehicle.color,
    currentCity: fleetVehicle.currentCity,
    status: fleetVehicle.status,
  }
}

function couponErrorCode(error: string): MobileErrorCode {
  return error.toLowerCase().includes('expired') ? 'COUPON_EXPIRED' : 'COUPON_INVALID'
}
