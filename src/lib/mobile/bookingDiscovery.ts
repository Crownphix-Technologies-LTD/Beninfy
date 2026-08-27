import { z } from 'zod'
import { vehicles as catalogVehicles } from '@/data/vehicles'
import { requiresLagosPickupArea, type RoutePriceScope } from '@/data/pricing'
import { calculateBookingPricing, calculateFareBreakdown } from '@/lib/bookingPricing'
import { calculateRouteBorderFeeNGN } from '@/lib/borderFeeCatalog'
import { prisma } from '@/lib/prisma'
import {
  findPublicRouteByCities,
  getBookingLocations,
  getPublicRouteById,
  getPublicRoutes,
  routePricingId,
} from '@/lib/routeCatalog'
import { getPublicVehicles } from '@/lib/vehicleCatalog'
import {
  getAvailableFleetVehicleCount,
  getAvailableFleetVehicles,
  assertFleetVehicleAvailable,
} from '@/lib/availability'
import { validateCouponCode, normalizeCouponCode } from '@/lib/coupons'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import {
  getRouteServiceArea,
  normalizeSupportedCountryCode,
  normalizeSupportedRouteCity,
  validateRouteLocationBoundaries,
  type RouteLocationBoundaryResult,
  type RouteServiceAreaValidationMetadata,
  type RouteLocationBoundaryInput,
} from '@/lib/mobile/routeLocationBoundary'
import type { Prisma } from '@prisma/client'
import type { Route, Vehicle } from '@/types'

export { calculateFareBreakdown }

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
  pickupCity: z.string().trim().max(80).optional().nullable(),
  pickupCountry: z.string().trim().max(80).optional().nullable(),
  pickupCountryCode: z.string().trim().max(3).optional().nullable(),
  pickupLatitude: z.number().min(-90).max(90).optional().nullable(),
  pickupLongitude: z.number().min(-180).max(180).optional().nullable(),
  destinationCity: z.string().trim().max(80).optional().nullable(),
  destinationCountry: z.string().trim().max(80).optional().nullable(),
  destinationCountryCode: z.string().trim().max(3).optional().nullable(),
  destinationLatitude: z.number().min(-90).max(90).optional().nullable(),
  destinationLongitude: z.number().min(-180).max(180).optional().nullable(),
  dropoffCity: z.string().trim().max(80).optional().nullable(),
  dropoffCountry: z.string().trim().max(80).optional().nullable(),
  dropoffCountryCode: z.string().trim().max(3).optional().nullable(),
  dropoffLatitude: z.number().min(-90).max(90).optional().nullable(),
  dropoffLongitude: z.number().min(-180).max(180).optional().nullable(),
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
  const originServiceArea = getRouteServiceArea(route.from)
  const destinationServiceArea = getRouteServiceArea(route.to)
  return {
    id: route.id,
    canonicalRouteId: route.canonicalRouteId ?? route.id,
    pricingRouteId: routePricingId(route),
    direction: route.direction ?? 'explicit',
    origin: {
      city: route.from,
      code: route.fromCode,
      country: route.fromCountry,
      serviceArea: originServiceArea
        ? { city: originServiceArea.city, countryCode: originServiceArea.countryCode }
        : null,
    },
    destination: {
      city: route.to,
      code: route.toCode,
      country: route.toCountry,
      serviceArea: destinationServiceArea
        ? { city: destinationServiceArea.city, countryCode: destinationServiceArea.countryCode }
        : null,
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

export function requiresPickupAreaForRoute(
  route: Route,
  pricingTargetId: string,
  pricingTargetName?: string
) {
  return (
    route.from.trim().toLowerCase() === 'lagos' &&
    requiresLagosPickupArea(routePricingId(route), pricingTargetId, pricingTargetName)
  )
}

export async function mobileRoutesCatalogue(client: PrismaClientLike = prisma) {
  const routes = await getPublicRoutes(client)
  const bookingCities = await getBookingLocations(client)
  return {
    routes: routes.map(toMobileRouteDto),
    locations: bookingCities.map((city) => ({
      city: city.city,
      country: city.country,
    })),
  }
}

export async function mobileRouteDetail(routeId: string) {
  const route = await getPublicRouteById(routeId)
  if (!route) return null
  return toMobileRouteDto(route)
}

export async function mobileVehiclesCatalogue() {
  const vehicles = await getPublicVehicles({ availableOnly: true })
  return { vehicles: vehicles.map(toMobileVehicleDto) }
}

export async function normalizeDiscoverySelection(
  input: MobileDiscoverySelectionInput,
  client: PrismaClientLike = prisma,
  options?: {
    serviceAreaDiagnosticsLabel?: string
  }
): Promise<
  MobileDiscoveryResult<{
    selection: MobileDiscoverySelection
    route: Route
    departureDate: Date
    returnDate: Date | null
    datesToCheck: Date[]
    locationMetadata: RouteServiceAreaValidationMetadata
  }>
> {
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
  const route = await resolveRoute(selection, client)
  if (!route) return { ok: false, code: 'ROUTE_NOT_FOUND', message: 'Route not found' }

  const boundary = validateRouteLocationBoundaries({
    route,
    pickup: pickupLocationFromSelection(selection),
    destination: destinationLocationFromSelection(selection),
  })
  if (options?.serviceAreaDiagnosticsLabel) {
    logServiceAreaValidationDiagnostics(
      options.serviceAreaDiagnosticsLabel,
      selection,
      route,
      boundary
    )
  }
  if (!boundary.ok) {
    return {
      ok: false,
      code: boundary.code,
      message: boundary.message,
      details: boundary.details,
    }
  }

  const normalized = normalizeDiscoverySelectionForRoute(selection, route)
  if (!normalized.ok) return normalized

  return {
    ok: true,
    data: {
      ...normalized.data,
      locationMetadata: boundary.metadata,
    },
  }
}

export function normalizeDiscoverySelectionForRoute(
  selection: MobileDiscoverySelection,
  route: Route
): MobileDiscoveryResult<{
  selection: MobileDiscoverySelection
  route: Route
  departureDate: Date
  returnDate: Date | null
  datesToCheck: Date[]
  locationMetadata?: RouteServiceAreaValidationMetadata
}> {
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
  const normalized = await normalizeDiscoverySelection(input, client, {
    serviceAreaDiagnosticsLabel: 'mobile-availability-service-area',
  })
  if (!normalized.ok) return normalized

  const vehicle = await resolveVehicle(normalized.data.selection.vehicleId, client)
  if (!vehicle)
    return { ok: false as const, code: 'VEHICLE_NOT_FOUND' as const, message: 'Vehicle not found' }
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
      pickupServiceArea: normalized.data.locationMetadata.pickupServiceArea,
      destinationServiceArea: normalized.data.locationMetadata.destinationServiceArea,
      pickupResolvedLocality: normalized.data.locationMetadata.pickupServiceArea.resolvedLocality,
      pickupFareZone: normalized.data.locationMetadata.pickupFareZone,
      fareZone: normalized.data.locationMetadata.pickupFareZone,
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

  const normalized = await normalizeDiscoverySelection(input, client)
  if (!normalized.ok) return normalized

  const vehicle = await resolveVehicle(normalized.data.selection.vehicleId, client)
  if (!vehicle)
    return { ok: false as const, code: 'VEHICLE_NOT_FOUND' as const, message: 'Vehicle not found' }

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

  const resolvedPickupArea = normalized.data.locationMetadata.pickupFareZone?.pricingScope

  const fare = await calculateBookingPricing({
    routeId: normalized.data.route.id,
    pricingRouteId: routePricingId(normalized.data.route),
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    fleetVehicleId: fleetVehicle?.id,
    fleetVehicleLabel: fleetVehicle?.label,
    tripType: normalized.data.selection.tripType,
    passengerCount: normalized.data.selection.passengers,
    pickupArea: resolvedPickupArea,
    pickupAreaRequired: false,
    client,
  })

  if (!fare.ok) {
    await logMobileQuoteUnavailableDiagnostics({
      selection: normalized.data.selection,
      route: normalized.data.route,
      vehicle,
      fleetVehicle: fleetVehicle ? toFleetVehicleSafe(fleetVehicle) : null,
      pickupFareZone: normalized.data.locationMetadata.pickupFareZone,
      pickupServiceArea: normalized.data.locationMetadata.pickupServiceArea,
      fareCode: fare.code,
      client,
    })

    return {
      ok: false as const,
      code:
        fare.code === 'PICKUP_AREA_REQUIRED' || fare.code === 'ROUTE_NOT_FOUND'
          ? fare.code
          : 'QUOTE_UNAVAILABLE',
      message: fare.message,
    }
  }

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
        pickupArea: resolvedPickupArea ?? null,
        pickupServiceArea: normalized.data.locationMetadata.pickupServiceArea,
        destinationServiceArea: normalized.data.locationMetadata.destinationServiceArea,
        pickupResolvedLocality: normalized.data.locationMetadata.pickupServiceArea.resolvedLocality,
        pickupFareZone: normalized.data.locationMetadata.pickupFareZone,
        fareZone: normalized.data.locationMetadata.pickupFareZone,
        currency: 'NGN' as const,
        pricing: {
          oneWayDropoffFare: mobileMoney(fare.oneWayDropoffFare),
          legCount: fare.legCount,
          rideFare: mobileMoney(fare.rideFareNGN),
          borderFee: {
            perPassenger: mobileMoney(fare.borderFeePerPassengerNGN),
            passengerCount: fare.borderFeePassengerCount,
            total: mobileMoney(fare.borderFeeNGN),
          },
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

async function resolveRoute(selection: MobileDiscoverySelection, client: PrismaClientLike) {
  if (selection.routeId) {
    const route = await getPublicRouteById(selection.routeId, client)
    if (!route) return null
    if (selection.from && selection.to && !routeMatchesSelection(route, selection)) {
      const directionalRoute = await findPublicRouteByCities(selection.from, selection.to, client)
      return directionalRoute ?? route
    }
    return route
  }
  if (selection.from && selection.to)
    return findPublicRouteByCities(selection.from, selection.to, client)
  return null
}

function routeMatchesSelection(route: Route, selection: MobileDiscoverySelection) {
  if (!selection.from || !selection.to) return true
  return (
    normalizeSupportedRouteCity(route.from) === normalizeSupportedRouteCity(selection.from) &&
    normalizeSupportedRouteCity(route.to) === normalizeSupportedRouteCity(selection.to)
  )
}

function serviceAreaDiagnosticsEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview'
}

type MobileQuotePricingDiagnosticsInput = {
  selection: MobileDiscoverySelection
  route: Route
  vehicle: Vehicle
  fleetVehicle: FleetVehicleSafe | null
  pickupFareZone: RouteServiceAreaValidationMetadata['pickupFareZone']
  pickupServiceArea: RouteServiceAreaValidationMetadata['pickupServiceArea']
  fareCode: string
  client: PrismaClientLike
}

async function logMobileQuoteUnavailableDiagnostics(input: MobileQuotePricingDiagnosticsInput) {
  if (!serviceAreaDiagnosticsEnabled()) return

  const pricingRouteId = routePricingId(input.route)
  const requestedPricingScope = input.selection.pickupArea ?? 'default'
  const resolvedPricingScope = input.pickupFareZone?.pricingScope ?? 'default'
  const pricingScopes =
    resolvedPricingScope === 'default'
      ? ['default']
      : ([resolvedPricingScope, 'default'] satisfies RoutePriceScope[])
  const targetIds = input.fleetVehicle
    ? [input.fleetVehicle.id, input.vehicle.id]
    : [input.vehicle.id]

  try {
    const [routeRows, routeRecord, borderFee] = await Promise.all([
      input.client.routePrice.findMany({
        where: {
          routeId: pricingRouteId,
          pricingScope: { in: pricingScopes },
        },
        select: { vehicleId: true, pricingScope: true, amountNGN: true },
      }),
      input.client.route.findFirst({
        where: { id: pricingRouteId, available: true },
        select: { id: true, borderFeeIds: true },
      }),
      calculateRouteBorderFeeNGN({
        routeId: pricingRouteId,
        tripType: input.selection.tripType,
        passengerCount: input.selection.passengers,
        client: input.client,
      }),
    ])
    const vehicleRows = routeRows.filter((row) => targetIds.includes(row.vehicleId))

    console.warn('[mobile-pricing-quote]', {
      requestRouteId: input.selection.routeId ?? null,
      resolvedRouteId: input.route.id,
      resolvedRouteDirection: input.route.direction ?? 'explicit',
      canonicalRouteId: input.route.canonicalRouteId ?? input.route.id,
      pricingRouteId,
      routeOriginCity: input.route.from,
      routeDestinationCity: input.route.to,
      vehicleId: input.vehicle.id,
      vehicleCategory: input.vehicle.name,
      passengerCount: input.selection.passengers,
      pickupServiceArea: {
        city: input.pickupServiceArea.serviceArea.city,
        countryCode: input.pickupServiceArea.serviceArea.countryCode,
        resolvedLocality: input.pickupServiceArea.resolvedLocality,
      },
      pickupFareZone: input.pickupFareZone
        ? {
            code: input.pickupFareZone.code,
            label: input.pickupFareZone.label,
            pricingScope: input.pickupFareZone.pricingScope,
          }
        : null,
      requestedPricingScope,
      resolvedPricingScope,
      matchingRoutePriceFound: routeRows.length > 0,
      matchingVehiclePriceFound: vehicleRows.length > 0,
      basePricePresent: vehicleRows.length > 0,
      borderFeeIdsCount: routeRecord?.borderFeeIds.length ?? 0,
      borderFeePerPassenger: borderFee.ok ? borderFee.perPassengerNGN : null,
      borderFeeTotal: borderFee.ok ? borderFee.amountNGN : null,
      quoteUnavailableReason: input.fareCode,
    })
  } catch {
    console.warn('[mobile-pricing-quote]', {
      requestRouteId: input.selection.routeId ?? null,
      resolvedRouteId: input.route.id,
      resolvedRouteDirection: input.route.direction ?? 'explicit',
      canonicalRouteId: input.route.canonicalRouteId ?? input.route.id,
      pricingRouteId,
      routeOriginCity: input.route.from,
      routeDestinationCity: input.route.to,
      vehicleId: input.vehicle.id,
      vehicleCategory: input.vehicle.name,
      passengerCount: input.selection.passengers,
      pickupServiceArea: {
        city: input.pickupServiceArea.serviceArea.city,
        countryCode: input.pickupServiceArea.serviceArea.countryCode,
        resolvedLocality: input.pickupServiceArea.resolvedLocality,
      },
      pickupFareZone: input.pickupFareZone
        ? {
            code: input.pickupFareZone.code,
            label: input.pickupFareZone.label,
            pricingScope: input.pickupFareZone.pricingScope,
          }
        : null,
      requestedPricingScope,
      resolvedPricingScope,
      matchingRoutePriceFound: null,
      matchingVehiclePriceFound: null,
      basePricePresent: null,
      borderFeeIdsCount: null,
      borderFeePerPassenger: null,
      borderFeeTotal: null,
      quoteUnavailableReason: input.fareCode,
    })
  }
}

function logServiceAreaValidationDiagnostics(
  label: string,
  selection: MobileDiscoverySelection,
  route: Route,
  boundary: RouteLocationBoundaryResult
) {
  if (!serviceAreaDiagnosticsEnabled()) return

  const pickupLocation = pickupLocationFromSelection(selection)
  const destinationLocation = destinationLocationFromSelection(selection)
  const pickupServiceArea = getRouteServiceArea(route.from)
  const destinationServiceArea = getRouteServiceArea(route.to)
  const normalizedPickupCity = normalizeSupportedRouteCity(pickupLocation?.city)
  const normalizedDestinationCity = normalizeSupportedRouteCity(destinationLocation?.city)

  console.warn(`[${label}]`, {
    requestRouteId: selection.routeId ?? null,
    submittedFromCity: selection.from ?? null,
    submittedToCity: selection.to ?? null,
    resolvedRouteId: route.id,
    resolvedRouteDirection: route.direction ?? 'explicit',
    resolvedRouteOriginCity: route.from,
    resolvedRouteOriginCountryCode: normalizeSupportedCountryCode({
      country: route.fromCountry,
    }),
    resolvedRouteDestinationCity: route.to,
    resolvedRouteDestinationCountryCode: normalizeSupportedCountryCode({
      country: route.toCountry,
    }),
    receivedPickupCity: pickupLocation?.city ?? null,
    receivedPickupCountryCode: pickupLocation?.countryCode ?? null,
    receivedDestinationCity: destinationLocation?.city ?? null,
    receivedDestinationCountryCode: destinationLocation?.countryCode ?? null,
    normalizedPickupCity,
    normalizedPickupCountryCode: normalizeSupportedCountryCode({
      country: pickupLocation?.country,
      countryCode: pickupLocation?.countryCode,
    }),
    normalizedDestinationCity,
    normalizedDestinationCountryCode: normalizeSupportedCountryCode({
      country: destinationLocation?.country,
      countryCode: destinationLocation?.countryCode,
    }),
    pickupServiceAreaKey: normalizeSupportedRouteCity(route.from),
    destinationServiceAreaKey: normalizeSupportedRouteCity(route.to),
    pickupLocalityAccepted: serviceAreaAcceptsLocation(
      pickupServiceArea,
      route.from,
      normalizedPickupCity,
      pickupLocation
    ),
    destinationLocalityAccepted: serviceAreaAcceptsLocation(
      destinationServiceArea,
      route.to,
      normalizedDestinationCity,
      destinationLocation
    ),
    failureCode: boundary.ok ? null : boundary.code,
  })
}

function serviceAreaAcceptsLocation(
  serviceArea: ReturnType<typeof getRouteServiceArea>,
  fallbackCity: string,
  normalizedLocality: string,
  location: RouteLocationBoundaryInput | null
) {
  if (location) {
    const result = locationMatchesDiagnosticServiceArea(serviceArea, fallbackCity, location)
    if (result !== null) return result
  }
  if (!normalizedLocality) return false
  return (serviceArea?.acceptedLocalities ?? [fallbackCity])
    .map(normalizeSupportedRouteCity)
    .includes(normalizedLocality)
}

function locationMatchesDiagnosticServiceArea(
  serviceArea: ReturnType<typeof getRouteServiceArea>,
  fallbackCity: string,
  location: RouteLocationBoundaryInput
) {
  const latitude = location.latitude
  const longitude = location.longitude
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  return (
    serviceArea?.boundary?.some((polygon) =>
      pointInDiagnosticPolygon({ latitude, longitude }, polygon)
    ) ??
    (normalizeSupportedRouteCity(location.city) === normalizeSupportedRouteCity(fallbackCity)
      ? true
      : null)
  )
}

function pointInDiagnosticPolygon(
  point: { latitude: number; longitude: number },
  polygon: Array<{ latitude: number; longitude: number }>
) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude
    const yi = polygon[i].latitude
    const xj = polygon[j].longitude
    const yj = polygon[j].latitude
    const intersects =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function pickupLocationFromSelection(
  selection: MobileDiscoverySelection
): RouteLocationBoundaryInput | null {
  return {
    city: selection.pickupCity,
    country: selection.pickupCountry,
    countryCode: selection.pickupCountryCode,
    latitude: selection.pickupLatitude,
    longitude: selection.pickupLongitude,
  }
}

function destinationLocationFromSelection(
  selection: MobileDiscoverySelection
): RouteLocationBoundaryInput | null {
  return {
    city: selection.destinationCity ?? selection.dropoffCity,
    country: selection.destinationCountry ?? selection.dropoffCountry,
    countryCode: selection.destinationCountryCode ?? selection.dropoffCountryCode,
    latitude: selection.destinationLatitude ?? selection.dropoffLatitude,
    longitude: selection.destinationLongitude ?? selection.dropoffLongitude,
  }
}

function parseTripDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function resolveVehicle(
  vehicleId: string,
  client: PrismaClientLike
): Promise<Vehicle | null> {
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
    selectableFleetUnits: available ? [toMobileFleetVehicleDto(fleetVehicle)] : [],
    informationalOnly: true,
    dates: checks,
  }
}

async function categoryAvailability(
  vehicleId: string,
  datesToCheck: Date[],
  client: PrismaClientLike
) {
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
    selectableFleetUnits: (await getAvailableFleetVehicles(vehicleId, datesToCheck, client)).map(
      (unit) => toMobileFleetVehicleDto(toFleetVehicleSafe(unit))
    ),
    informationalOnly: true,
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
