import { tourPickupSchema, tourPickupSnapshot, type TourPickup } from '@/lib/mobile/tourPickup'
import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hasCompleteTourStopLocation } from '@/lib/tourItinerary'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import { validateCotonouTourPickup } from '@/lib/mobile/tourPickupTerritory'
import { tourCommercialSelectionSchema, orderedTourIds, calculateTourCommercialSnapshot, canonicalTourExecutionReadiness, type TourCommercialSelection } from '@/lib/tourCommercial'

export const TOUR_BOOKING_STATUSES = [
  'quote_pending',
  'payment_pending',
  'confirmed',
  'active',
  'completed',
  'cancelled',
] as const
export const TOUR_BOOKING_DAY_STATUSES = [
  'upcoming',
  'assigned',
  'driver_en_route',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled',
] as const
export const TOUR_STOP_EXECUTION_STATUSES = [
  'upcoming',
  'en_route',
  'arrived',
  'completed',
  'skipped',
] as const

export const TOUR_BOOKING_MIN_TRAVELLERS = 1
export const TOUR_BOOKING_MAX_TRAVELLERS = 30

type Dateish = Date | string

type TourBookingWithDays = {
  subtotalNGN?: number | null
  discountNGN?: number
  couponSnapshot?: unknown
  selectedTourIds?: string[]
  vehicleCategoryId?: string | null
  vehicleCategoryName?: string | null
  vehicleCapacity?: number | null
  itineraryMode?: string
  customItinerary?: string | null
  quoteStatus?: string
  commercialSnapshot?: unknown
  pickupLabel?: string | null
  pickupAddress?: string | null
  pickupLatitude?: number | null
  pickupLongitude?: number | null
  id: string
  userId: string
  tourId: string
  reference: string
  status: string
  paymentStatus: string
  currencyCode: string
  priceNGN: number
  amountPaidNGN: number
  paymentProvider: string | null
  paymentReference: string | null
  idempotencyKey?: string | null
  tourTitle: string
  tourTitleFr: string | null
  tourDestination: string | null
  tourDestinationFr: string | null
  tourCountry: string
  tourCountryFr: string | null
  tourImage: string | null
  startDate: Dateish
  endDate: Dateish
  travellers: number
  cancelledAt: Dateish | null
  completedAt: Dateish | null
  createdAt: Dateish
  updatedAt: Dateish
  days: TourBookingDayWithStops[]
}

type TourBookingDayWithStops = {
  sourceTourId?: string | null
  sourceTourTitle?: string | null
  transportationOnly?: boolean
  componentPriceMinor?: number | null
  gogotinkpo?: boolean
  id: string
  tourBookingId: string
  sourceItineraryDayId: string | null
  dayNumber: number
  scheduledDate: Dateish
  status: string
  title: string
  titleFr: string | null
  description: string | null
  descriptionFr: string | null
  pickupLabel: string | null
  pickupAddress: string | null
  pickupLatitude: number | null
  pickupLongitude: number | null
  endLabel: string | null
  endAddress: string | null
  endLatitude: number | null
  endLongitude: number | null
  assignedDriverId: string | null
  assignedFleetVehicleId: string | null
  assignedAt: Dateish | null
  acceptedAt: Dateish | null
  driverEnRouteAt: Dateish | null
  driverArrivedAt: Dateish | null
  startedAt: Dateish | null
  completedAt: Dateish | null
  cancelledAt: Dateish | null
  stops: TourStopExecutionForDto[]
  latestLocation?: {
    latitude: number
    longitude: number
    accuracyMeters: number | null
    headingDegrees: number | null
    speedMetersPerSecond: number | null
    sequence: number | null
    capturedAt: Dateish
    receivedAt: Dateish
    expiresAt: Dateish
  } | null
  journeySnapshot?: {
    target?: string | null
    targetStopId?: string | null
    encodedPolyline: string | null
    distanceRemainingMeters: number | null
    estimatedDurationSeconds: number | null
    estimatedArrivalAt: Dateish | null
    calculatedAt: Dateish
    expiresAt: Dateish
  } | null
}

type TourStopExecutionForDto = {
  id: string
  tourBookingDayId: string
  sourceItineraryStopId: string | null
  sortOrder: number
  title: string
  titleFr: string | null
  description: string | null
  descriptionFr: string | null
  address: string
  latitude: number
  longitude: number
  estimatedDurationMinutes: number | null
  required: boolean
  status: string
  enRouteAt: Dateish | null
  arrivedAt: Dateish | null
  completedAt: Dateish | null
  skippedAt: Dateish | null
  skipReason: string | null
}

function iso(value: Dateish | null | undefined) {
  return value ? new Date(value).toISOString() : null
}

function dateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export function validateTourStartDate(value: string, now = new Date()) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return { ok: false as const, code: 'TOUR_BOOKING_DATE_INVALID' as MobileErrorCode }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) {
    return { ok: false as const, code: 'TOUR_BOOKING_DATE_INVALID' as MobileErrorCode }
  }
  if (date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    return { ok: false as const, code: 'TOUR_BOOKING_DATE_INVALID' as MobileErrorCode }
  }
  if (date < dateOnly(now)) {
    return { ok: false as const, code: 'TOUR_BOOKING_DATE_INVALID' as MobileErrorCode }
  }
  return { ok: true as const, date }
}

export function validateTourTravellerCount(value: number) {
  if (
    !Number.isInteger(value) ||
    value < TOUR_BOOKING_MIN_TRAVELLERS ||
    value > TOUR_BOOKING_MAX_TRAVELLERS
  ) {
    return { ok: false as const, code: 'TOUR_TRAVELLER_COUNT_INVALID' as MobileErrorCode }
  }
  return { ok: true as const, travellers: value }
}

export function normalizeTourBookingIdempotencyKey(value: unknown) {
  if (value === undefined || value === null || value === '') return { ok: true as const, key: null }
  if (typeof value !== 'string') {
    return { ok: false as const, code: 'VALIDATION_ERROR' as MobileErrorCode }
  }
  const key = value.trim()
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) {
    return { ok: false as const, code: 'VALIDATION_ERROR' as MobileErrorCode }
  }
  return { ok: true as const, key }
}

export function generateTourBookingReference() {
  return `BFYT-${randomBytes(5).toString('hex').toUpperCase()}`
}

function endDateFor(startDate: Date, dayCount: number) {
  return new Date(startDate.getTime() + Math.max(dayCount - 1, 0) * 24 * 60 * 60 * 1000)
}

function paymentDto(booking: TourBookingWithDays) {
  return {
    status: booking.paymentStatus,
    amount: {
      value: booking.priceNGN,
      currency: booking.currencyCode,
      minorUnit: 'kobo',
      minorValue: booking.priceNGN * 100,
    },
    amountPaidNGN: booking.amountPaidNGN,
    provider: booking.paymentProvider,
    paymentReference: booking.paymentReference,
    canInitialize: booking.status === 'payment_pending' && ['pending', 'failed'].includes(booking.paymentStatus),
  }
}

export function toTourBookingDayDto(day: TourBookingDayWithStops, totalDays: number) {
  const stops = [...day.stops]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((stop, index) => ({
      id: stop.id,
      sourceItineraryStopId: stop.sourceItineraryStopId,
      sortOrder: stop.sortOrder,
      stopNumber: index + 1,
      totalStops: day.stops.length,
      title: stop.title,
      titleFr: stop.titleFr,
      description: stop.description,
      descriptionFr: stop.descriptionFr,
      address: stop.address,
      coordinates: { latitude: stop.latitude, longitude: stop.longitude },
      estimatedDurationMinutes: stop.estimatedDurationMinutes,
      required: stop.required,
      status: stop.status,
      timestamps: {
        enRouteAt: iso(stop.enRouteAt),
        arrivedAt: iso(stop.arrivedAt),
        completedAt: iso(stop.completedAt),
        skippedAt: iso(stop.skippedAt),
      },
      skipReason: stop.skipReason,
    }))

  return {
    id: day.id,
    sourceItineraryDayId: day.sourceItineraryDayId,
    sourceTourId: day.sourceTourId ?? null,
    sourceTourTitle: day.sourceTourTitle ?? null,
    transportationOnly: day.transportationOnly ?? false,
    componentPriceMinor: day.componentPriceMinor ?? null,
    gogotinkpo: day.gogotinkpo ?? false,
    dayNumber: day.dayNumber,
    totalDays,
    label: `Day ${day.dayNumber} of ${totalDays}`,
    scheduledDate: iso(day.scheduledDate),
    status: day.status,
    title: day.title,
    titleFr: day.titleFr,
    description: day.description,
    descriptionFr: day.descriptionFr,
    pickup: {
      label: day.pickupLabel,
      address: day.pickupAddress,
      coordinates:
        typeof day.pickupLatitude === 'number' && typeof day.pickupLongitude === 'number'
          ? { latitude: day.pickupLatitude, longitude: day.pickupLongitude }
          : null,
    },
    end: {
      label: day.endLabel,
      address: day.endAddress,
      coordinates:
        typeof day.endLatitude === 'number' && typeof day.endLongitude === 'number'
          ? { latitude: day.endLatitude, longitude: day.endLongitude }
          : null,
    },
    assignment: {
      driverId: day.assignedDriverId,
      fleetVehicleId: day.assignedFleetVehicleId,
      assignedAt: iso(day.assignedAt),
      acceptedAt: iso(day.acceptedAt),
    },
    timestamps: {
      driverEnRouteAt: iso(day.driverEnRouteAt),
      driverArrivedAt: iso(day.driverArrivedAt),
      startedAt: iso(day.startedAt),
      completedAt: iso(day.completedAt),
      cancelledAt: iso(day.cancelledAt),
    },
    stops,
    tracking: {
      latestLocation: day.latestLocation
        ? {
            latitude: day.latestLocation.latitude,
            longitude: day.latestLocation.longitude,
            accuracyMeters: day.latestLocation.accuracyMeters,
            headingDegrees: day.latestLocation.headingDegrees,
            speedMetersPerSecond: day.latestLocation.speedMetersPerSecond,
            sequence: day.latestLocation.sequence,
            capturedAt: iso(day.latestLocation.capturedAt),
            receivedAt: iso(day.latestLocation.receivedAt),
            expiresAt: iso(day.latestLocation.expiresAt),
          }
        : null,
      journey: day.journeySnapshot
        ? {
            target: day.journeySnapshot.target,
            targetStopId: day.journeySnapshot.targetStopId,
            routePolyline: day.journeySnapshot.encodedPolyline,
            distanceRemainingMeters: day.journeySnapshot.distanceRemainingMeters,
            estimatedDurationSeconds: day.journeySnapshot.estimatedDurationSeconds,
            estimatedArrivalAt: iso(day.journeySnapshot.estimatedArrivalAt),
            calculatedAt: iso(day.journeySnapshot.calculatedAt),
            expiresAt: iso(day.journeySnapshot.expiresAt),
          }
        : null,
    },
  }
}

export function toTourBookingDto(booking: TourBookingWithDays) {
  const days = [...booking.days].sort((left, right) => left.dayNumber - right.dayNumber)
  return {
    id: booking.id,
    reference: booking.reference,
    tourId: booking.tourId,
    selectedTourIds: booking.selectedTourIds?.length ? booking.selectedTourIds : [booking.tourId],
    vehicleCategory: booking.vehicleCategoryId ? { id: booking.vehicleCategoryId, name: booking.vehicleCategoryName, capacity: booking.vehicleCapacity } : null,
    itineraryMode: booking.itineraryMode ?? 'standard',
    customItinerary: booking.customItinerary ?? null,
    quoteStatus: booking.quoteStatus ?? 'not_required',
    commercial: booking.commercialSnapshot ?? null,
    pricing: {
      subtotal: { value: booking.subtotalNGN ?? booking.priceNGN + (booking.discountNGN ?? 0), currency: 'NGN', minorUnit: 'kobo', minorValue: (booking.subtotalNGN ?? booking.priceNGN + (booking.discountNGN ?? 0)) * 100 },
      discount: { value: booking.discountNGN ?? 0, currency: 'NGN', minorUnit: 'kobo', minorValue: (booking.discountNGN ?? 0) * 100 },
      total: { value: booking.priceNGN, currency: 'NGN', minorUnit: 'kobo', minorValue: booking.priceNGN * 100 },
      coupon: booking.couponSnapshot ?? null,
    },
    status: booking.status,
    startDate: iso(booking.startDate),
    endDate: iso(booking.endDate),
    travellers: booking.travellers,
    pickup: {
      label: booking.pickupLabel ?? null,
      address: booking.pickupAddress ?? null,
      coordinates:
        typeof booking.pickupLatitude === 'number' && typeof booking.pickupLongitude === 'number'
          ? { latitude: booking.pickupLatitude, longitude: booking.pickupLongitude }
          : null,
    },
    price: {
      value: booking.priceNGN,
      currency: booking.currencyCode,
      minorUnit: 'kobo',
      minorValue: booking.priceNGN * 100,
    },
    payment: paymentDto(booking),
    tour: {
      id: booking.tourId,
      title: booking.tourTitle,
      titleFr: booking.tourTitleFr,
      destination: booking.tourDestination,
      destinationFr: booking.tourDestinationFr,
      country: booking.tourCountry,
      countryFr: booking.tourCountryFr,
      image: booking.tourImage,
    },
    progress: {
      currentDay: days.find((day) => !['completed', 'cancelled'].includes(day.status))?.dayNumber ?? null,
      totalDays: days.length,
    },
    days: days.map((day) => toTourBookingDayDto(day, days.length)),
    timestamps: {
      cancelledAt: iso(booking.cancelledAt),
      completedAt: iso(booking.completedAt),
      createdAt: iso(booking.createdAt),
      updatedAt: iso(booking.updatedAt),
    },
  }
}

const tourBookingInclude = {
  days: {
    orderBy: { dayNumber: 'asc' as const },
    include: {
      stops: { orderBy: { sortOrder: 'asc' as const } },
      latestLocation: true,
      journeySnapshot: true,
    },
  },
} satisfies Prisma.TourBookingInclude

async function uniqueTourReference(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = generateTourBookingReference()
    const existing = await tx.tourBooking.findUnique({ where: { reference }, select: { id: true } })
    if (!existing) return reference
  }
  throw new Error('Unable to allocate tour booking reference')
}

function isTourBookingWriteConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true
  // adapter-pg can surface serialization/deadlock errors at COMMIT directly.
  if (!(error instanceof Error) || !('cause' in error)) return false
  const cause = error.cause
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'originalCode' in cause &&
    (cause.originalCode === '40001' || cause.originalCode === '40P01')
  )
}

async function prepareTourCommercialPlan(selection: TourCommercialSelection, pickup: TourPickup, travellers: number, client = prisma) {
  const pickupTerritory = await validateCotonouTourPickup(pickup)
  if (!pickupTerritory.ok) return pickupTerritory
  const ids = orderedTourIds(selection.tourIds)
  const tours = await client.tour.findMany({
    where: { id: { in: ids }, active: true },
    include: { itineraryDays: { orderBy: { dayNumber: 'asc' }, include: { stops: { orderBy: { sortOrder: 'asc' } } } } },
  })
  if (tours.length !== ids.length) return { ok: false as const, code: 'TOUR_NOT_FOUND' as MobileErrorCode }
  const orderedTours = ids.map((id) => tours.find((tour) => tour.id === id)!)
  const vehicle = await client.vehicle.findUnique({ where: { id: selection.vehicleCategoryId } })
  if (!vehicle?.available || !vehicle.tourPricingCategory) return { ok: false as const, code: 'VEHICLE_NOT_AVAILABLE' as MobileErrorCode }
  if (travellers > vehicle.capacity) return { ok: false as const, code: 'TOUR_TRAVELLER_COUNT_INVALID' as MobileErrorCode }
  const rate = await client.tourCommercialRate.findUnique({ where: { id: vehicle.tourPricingCategory } })
  if (!rate?.active) return { ok: false as const, code: 'QUOTE_UNAVAILABLE' as MobileErrorCode }
  const readiness = orderedTours.map(canonicalTourExecutionReadiness).find((value) => !value.executionReady)
  if (selection.itineraryMode === 'standard' && readiness)
    return { ok: false as const, code: 'TOUR_NOT_EXECUTION_READY' as MobileErrorCode, readiness }
  if (selection.itineraryMode === 'standard' && selection.gogotinkpo && !orderedTours[0].itineraryDays[0].stops.some((stop) => stop.addonCode === 'gogotinkpo'))
    return { ok: false as const, code: 'TOUR_NOT_EXECUTION_READY' as MobileErrorCode }
  const commercial = calculateTourCommercialSnapshot({ tourIds: ids, priceMinor: rate.priceMinor, gogotinkpo: selection.gogotinkpo })
  return { ok: true as const, ids, orderedTours, vehicle, rate, commercial }
}

export async function quoteCustomerTourSelection(input: {
  tourIds: string[]; vehicleCategoryId: string; gogotinkpo?: boolean;
  itineraryMode?: 'standard' | 'custom'; customItinerary?: string;
  pickup: TourPickup; travellers: number; startDate: string;
}, client = prisma) {
  const selection = tourCommercialSelectionSchema.safeParse(input)
  const pickup = tourPickupSchema.safeParse(input.pickup)
  if (!selection.success || !pickup.success) return { ok: false as const, code: 'VALIDATION_ERROR' as MobileErrorCode }
  const start = validateTourStartDate(input.startDate)
  if (!start.ok) return start
  const travellers = validateTourTravellerCount(input.travellers)
  if (!travellers.ok) return travellers
  const plan = await prepareTourCommercialPlan(selection.data, pickup.data, travellers.travellers, client)
  if (!plan.ok) return plan
  const custom = selection.data.itineraryMode === 'custom'
  return { ok: true as const, dto: {
    selectedTourIds: plan.ids, totalDays: plan.ids.length, itineraryMode: selection.data.itineraryMode,
    quoteRequired: custom, payable: !custom,
    vehicleCategory: { id: plan.vehicle.id, name: plan.vehicle.name, capacity: plan.vehicle.capacity },
    pricing: custom ? null : plan.commercial,
    standardEstimate: custom ? plan.commercial : null,
    pickupServiceArea: { city: 'Cotonou', countryCode: 'BJ' },
    // Quotes are previews; booking creation recalculates from current authoritative configuration.
  } }
}

export async function createCustomerTourBooking(input: {
  principal: MobilePrincipal
  tourId: string
  tourIds?: string[]
  vehicleCategoryId?: string
  gogotinkpo?: boolean
  itineraryMode?: 'standard' | 'custom'
  customItinerary?: string
  startDate: string
  pickup: TourPickup
  travellers: number
  idempotencyKey?: string | null
}, client = prisma) {
  const pickup = tourPickupSchema.safeParse(input.pickup)
  if (!pickup.success) return { ok: false as const, code: 'VALIDATION_ERROR' as MobileErrorCode }
  const pickupData = tourPickupSnapshot(pickup.data)
  const start = validateTourStartDate(input.startDate)
  if (!start.ok) return start
  const travellers = validateTourTravellerCount(input.travellers)
  if (!travellers.ok) return travellers
  const idempotency = normalizeTourBookingIdempotencyKey(input.idempotencyKey)
  if (!idempotency.ok) return idempotency

  const selection = tourCommercialSelectionSchema.safeParse({
    tourIds: input.tourIds ?? [input.tourId], vehicleCategoryId: input.vehicleCategoryId,
    gogotinkpo: input.gogotinkpo, itineraryMode: input.itineraryMode, customItinerary: input.customItinerary,
  })
  if (!selection.success) return { ok: false as const, code: 'VALIDATION_ERROR' as MobileErrorCode }

  if (idempotency.key) {
    const existing = await client.tourBooking.findFirst({
      where: {
        userId: input.principal.userId,
        idempotencyKey: idempotency.key,
      },
      include: tourBookingInclude,
    })
    if (existing) {
      return {
        ok: true as const,
        booking: existing,
        dto: toTourBookingDto(existing),
        pricingBasis: 'existing-idempotency-key',
        idempotent: true,
      }
    }
  }

  const plan = await prepareTourCommercialPlan(selection.data, pickup.data, travellers.travellers, client)
  if (!plan.ok) return plan
  const { ids, orderedTours, vehicle, rate, commercial } = plan
  const tour = orderedTours[0]
  const custom = selection.data.itineraryMode === 'custom'
  const price = { currencyCode: 'NGN', priceNGN: custom ? 0 : commercial.priceNGN, pricingBasis: custom ? 'operations_quote_required' : commercial.pricingBasis }
  const endDate = endDateFor(start.date, orderedTours.length)
  for (let attempt = 0; ; attempt += 1) {
    try {
      const created = await client.$transaction(
        async (tx) => {
          const reference = await uniqueTourReference(tx)
          return tx.tourBooking.create({
            data: {
              ...pickupData,
              userId: input.principal.userId,
              tourId: tour.id,
              selectedTourIds: ids,
              vehicleCategoryId: vehicle.id,
              vehicleCategoryName: vehicle.name,
              vehicleCapacity: vehicle.capacity,
              itineraryMode: selection.data.itineraryMode,
              customItinerary: selection.data.customItinerary ?? null,
              quoteStatus: custom ? 'pending' : 'not_required',
              commercialSnapshot: custom
                ? { version: 1, currency: 'NGN', pricingBasis: 'operations_quote_required', standardEstimate: commercial, totalMinor: null, vehicleCategoryId: vehicle.id, pricingCategory: rate.id, quoteRequired: true }
                : { ...commercial, vehicleCategoryId: vehicle.id, pricingCategory: rate.id, quoteRequired: false },
              reference,
              status: custom ? 'quote_pending' : 'payment_pending',
              paymentStatus: 'pending',
              currencyCode: price.currencyCode,
              priceNGN: price.priceNGN,
              subtotalNGN: custom ? null : price.priceNGN,
              amountPaidNGN: 0,
              idempotencyKey: idempotency.key,
              tourTitle: orderedTours.map((value) => value.title).join(' + '),
              tourTitleFr: orderedTours.map((value) => value.titleFr ?? value.title).join(' + '),
              tourDestination: orderedTours.map((value) => value.destination ?? value.title).join(' + '),
              tourDestinationFr: orderedTours.map((value) => value.destinationFr ?? value.destination ?? value.title).join(' + '),
              tourCountry: tour.country,
              tourCountryFr: tour.countryFr,
              tourImage: tour.image,
              startDate: start.date,
              endDate,
              travellers: travellers.travellers,
              days: {
                create: orderedTours.map((sourceTour, index) => {
                  const day = sourceTour.itineraryDays[0] ?? {
                    id: null, title: sourceTour.title, titleFr: sourceTour.titleFr,
                    description: sourceTour.description, descriptionFr: sourceTour.descriptionFr,
                    defaultEndLabel: null, defaultEndAddress: null, defaultEndLatitude: null, defaultEndLongitude: null,
                    stops: [],
                  }
                  return {
                  sourceTourId: sourceTour.id,
                  sourceTourTitle: sourceTour.title,
                  transportationOnly: sourceTour.id === 'ganvie-tour',
                  componentPriceMinor: custom ? null : commercial.components[index].totalMinor,
                  gogotinkpo: commercial.components[index].gogotinkpo,
                  sourceItineraryDayId: day.id,
                  dayNumber: index + 1,
                  scheduledDate: new Date(
                    start.date.getTime() + index * 24 * 60 * 60 * 1000
                  ),
                  status: 'upcoming',
                  title: day.title,
                  titleFr: day.titleFr,
                  description: day.description,
                  descriptionFr: day.descriptionFr,
                  ...pickupData,
                  endLabel: day.defaultEndLabel,
                  endAddress: day.defaultEndAddress,
                  endLatitude: day.defaultEndLatitude,
                  endLongitude: day.defaultEndLongitude,
                  stops: {
                    create: day.stops.filter(hasCompleteTourStopLocation).filter((stop) => !stop.addonCode || (commercial.components[index].gogotinkpo && stop.addonCode === 'gogotinkpo')).map((stop) => ({
                      sourceItineraryStopId: stop.id,
                      sortOrder: stop.sortOrder,
                      title: stop.title,
                      titleFr: stop.titleFr,
                      description: stop.description,
                      descriptionFr: stop.descriptionFr,
                      address: stop.address,
                      latitude: stop.latitude,
                      longitude: stop.longitude,
                      estimatedDurationMinutes: stop.estimatedDurationMinutes,
                      required: stop.required,
                      status: 'upcoming',
                    })),
                  },
                }}),
              },
            },
            include: tourBookingInclude,
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )

      return {
        ok: true as const,
        booking: created,
        dto: toTourBookingDto(created),
        pricingBasis: price.pricingBasis,
      }
    } catch (error) {
      const retryable = isTourBookingWriteConflict(error)
      if (
        idempotency.key &&
        (retryable ||
          (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
      ) {
        const existing = await client.tourBooking.findFirst({
          where: {
            userId: input.principal.userId,
            idempotencyKey: idempotency.key,
          },
          include: tourBookingInclude,
        })
        if (existing) {
          return {
            ok: true as const,
            booking: existing,
            dto: toTourBookingDto(existing),
            pricingBasis: 'existing-idempotency-key',
            idempotent: true,
          }
        }
      }
      // Serializable booking creation can conflict with simultaneous bookings.
      // Retry the rolled-back transaction without changing the customer intent/key.
      if (retryable && attempt < 2) continue
      throw error
    }
  }
}

export async function listCustomerTourBookings(principal: MobilePrincipal) {
  const bookings = await prisma.tourBooking.findMany({
    where: { userId: principal.userId },
    orderBy: { createdAt: 'desc' },
    include: tourBookingInclude,
    take: 100,
  })
  return bookings.map(toTourBookingDto)
}

export async function getCustomerTourBooking(input: {
  principal: MobilePrincipal
  tourBookingId: string
}) {
  const booking = await prisma.tourBooking.findFirst({
    where: { id: input.tourBookingId, userId: input.principal.userId },
    include: tourBookingInclude,
  })
  if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as MobileErrorCode }
  return { ok: true as const, booking, dto: toTourBookingDto(booking) }
}

export async function cancelCustomerTourBooking(input: {
  principal: MobilePrincipal
  tourBookingId: string
}) {
  const now = new Date()
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TourBooking" WHERE "id" = ${input.tourBookingId} FOR UPDATE`
      const booking = await tx.tourBooking.findFirst({
        where: { id: input.tourBookingId, userId: input.principal.userId },
        include: {
          ...tourBookingInclude,
          payments: { select: { status: true }, orderBy: { createdAt: 'desc' } },
        },
      })
      if (!booking)
        return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as MobileErrorCode }
      const paid =
        booking.paymentStatus === 'paid' || booking.payments.some((payment) => payment.status === 'paid')
      if (paid) {
        return {
          ok: true as const,
          booking,
          dto: toTourBookingDto(booking),
          cancelled: false,
          paymentStatus: 'paid',
          idempotent: true,
        }
      }
      if (booking.status === 'cancelled') {
        return {
          ok: true as const,
          booking,
          dto: toTourBookingDto(booking),
          cancelled: true,
          paymentStatus: booking.paymentStatus,
          idempotent: true,
        }
      }
      if (
        !['payment_pending', 'quote_pending'].includes(booking.status) ||
        booking.paymentStatus !== 'pending'
      ) {
        return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }
      }
      await tx.tourBookingDay.updateMany({
        where: {
          tourBookingId: booking.id,
          status: { notIn: ['completed', 'cancelled'] },
        },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          assignedDriverId: null,
          assignedFleetVehicleId: null,
          assignedAt: null,
          acceptedAt: null,
        },
      })
      await tx.tourStopExecution.updateMany({
        where: {
          tourBookingDay: { tourBookingId: booking.id },
          status: { notIn: ['completed', 'skipped'] },
        },
        data: { status: 'skipped', skippedAt: now, skipReason: 'tour_cancelled' },
      })
      await tx.latestTourLocation.updateMany({
        where: { tourBookingDay: { tourBookingId: booking.id } },
        data: { expiresAt: now },
      })
      const updated = await tx.tourBooking.update({
        where: { id: booking.id },
        data: { status: 'cancelled', cancelledAt: now },
        include: tourBookingInclude,
      })
      return {
        ok: true as const,
        booking: updated,
        dto: toTourBookingDto(updated),
        cancelled: true,
        paymentStatus: updated.paymentStatus,
        idempotent: false,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}

export async function listAdminTourBookings() {
  const bookings = await prisma.tourBooking.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      ...tourBookingInclude,
    },
    take: 200,
  })
  return bookings.map((booking) => ({
    ...toTourBookingDto(booking),
    customer: booking.user,
  }))
}

export async function getAdminTourBooking(id: string) {
  const booking = await prisma.tourBooking.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      ...tourBookingInclude,
    },
  })
  if (!booking) return null
  return {
    ...toTourBookingDto(booking),
    customer: booking.user,
  }
}

export function tourPaymentFoundation() {
  return {
    externalPaymentInitializationImplemented: true,
    reason:
      'Tour payments use explicit Payment.tourBookingId ownership and the shared Paystack/PayOnUs provider settlement path.',
    couponSupport: true,
  }
}
