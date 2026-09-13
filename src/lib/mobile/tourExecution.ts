import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/auditLog'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import {
  canDriverExecuteAssignedTrip,
  canDriverReceiveNewAssignment,
  normalizeDriverTripView,
  type DriverTripView,
} from '@/lib/mobile/driverOperations'
import { NON_BLOCKING_LEG_STATUSES } from '@/lib/tripLifecycle'

export const DRIVER_TOUR_ACTIONS = [
  'accept',
  'decline',
  'start_en_route',
  'arrive',
  'start_day',
  'arrive_stop',
  'complete_stop',
  'complete_day',
] as const

export type DriverTourAction = (typeof DRIVER_TOUR_ACTIONS)[number]

export const TOUR_DAY_EXECUTION_STATUSES = [
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

type Dateish = Date | string

export type TourDayForDto = {
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
  createdAt: Dateish
  updatedAt: Dateish
  assignedDriver?: DriverForDto | null
  assignedFleetVehicle?: FleetVehicleForDto | null
  stops: TourStopForDto[]
  tourBooking: TourBookingForDto
}

type TourStopForDto = {
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

type TourBookingForDto = {
  id: string
  reference: string
  status: string
  paymentStatus: string
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
  priceNGN: number
  currencyCode: string
  user: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
  }
  days: Array<{ id: string; dayNumber: number; status: string }>
}

type DriverForDto = {
  id: string
  name: string
  phone: string
  email: string | null
  status: string
}

type FleetVehicleForDto = {
  id: string
  label: string
  plateNumber: string
  color: string | null
  status: string
  currentCity: string | null
}

export const tourDayInclude = {
  assignedDriver: true,
  assignedFleetVehicle: true,
  stops: { orderBy: { sortOrder: 'asc' as const } },
  tourBooking: {
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      days: { select: { id: true, dayNumber: true, status: true }, orderBy: { dayNumber: 'asc' as const } },
    },
  },
} satisfies Prisma.TourBookingDayInclude

function iso(value: Dateish | null | undefined) {
  return value ? new Date(value).toISOString() : null
}

function dayWindow(date: Dateish) {
  const parsed = new Date(date)
  const startsAt = new Date(parsed)
  startsAt.setHours(0, 0, 0, 0)
  const endsAt = new Date(parsed)
  endsAt.setHours(23, 59, 59, 999)
  return { startsAt, endsAt }
}

function tourBookingExecutable(booking: { status: string; paymentStatus: string }) {
  return (
    ['confirmed', 'active', 'completed'].includes(booking.status) &&
    booking.paymentStatus === 'paid'
  )
}

export function isDriverTourAction(value: unknown): value is DriverTourAction {
  return typeof value === 'string' && DRIVER_TOUR_ACTIONS.includes(value as DriverTourAction)
}

export function currentTourStop(stops: TourStopForDto[]) {
  return [...stops]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .find((stop) => !['completed', 'skipped'].includes(stop.status)) ?? null
}

export function nextTourStop(stops: TourStopForDto[], currentStopId?: string | null) {
  const ordered = [...stops].sort((left, right) => left.sortOrder - right.sortOrder)
  if (!currentStopId) return null
  const index = ordered.findIndex((stop) => stop.id === currentStopId)
  return ordered.slice(index + 1).find((stop) => !['completed', 'skipped'].includes(stop.status)) ?? null
}

function hasPickup(day: TourDayForDto) {
  return (
    Boolean(day.pickupAddress || day.pickupLabel) &&
    typeof day.pickupLatitude === 'number' &&
    typeof day.pickupLongitude === 'number'
  )
}

function requiredStopsComplete(day: TourDayForDto) {
  return day.stops.every((stop) => !stop.required || stop.status === 'completed')
}

export function allowedDriverTourActions(day: TourDayForDto) {
  if (!day.assignedDriverId || !day.assignedFleetVehicleId) return []
  if (!tourBookingExecutable(day.tourBooking)) return []
  if (day.status === 'cancelled' || day.tourBooking.status === 'cancelled') return []
  if (day.assignedDriver && !canDriverExecuteAssignedTrip(day.assignedDriver.status)) return []
  if (day.status === 'assigned' && !day.acceptedAt) return ['accept', 'decline'] as DriverTourAction[]
  if (day.status === 'assigned' && day.acceptedAt && hasPickup(day)) return ['start_en_route'] as DriverTourAction[]
  if (day.status === 'driver_en_route') return ['arrive'] as DriverTourAction[]
  if (day.status === 'driver_arrived') return ['start_day'] as DriverTourAction[]
  if (day.status === 'in_progress') {
    const stop = currentTourStop(day.stops)
    if (!stop && requiredStopsComplete(day)) return ['complete_day'] as DriverTourAction[]
    if (stop?.status === 'upcoming' || stop?.status === 'en_route') return ['arrive_stop'] as DriverTourAction[]
    if (stop?.status === 'arrived') return ['complete_stop'] as DriverTourAction[]
  }
  return []
}

function stopDto(stop: TourStopForDto, index: number, totalStops: number) {
  return {
    id: stop.id,
    sourceItineraryStopId: stop.sourceItineraryStopId,
    sortOrder: stop.sortOrder,
    stopNumber: index + 1,
    totalStops,
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
  }
}

export function toDriverTourDayDto(day: TourDayForDto) {
  const orderedStops = [...day.stops].sort((left, right) => left.sortOrder - right.sortOrder)
  const current = currentTourStop(orderedStops)
  const next = nextTourStop(orderedStops, current?.id)
  const totalDays = day.tourBooking.days.length
  const completedStopCount = orderedStops.filter((stop) => stop.status === 'completed').length
  const totalStopCount = orderedStops.length

  return {
    tourBookingId: day.tourBookingId,
    tourBookingDayId: day.id,
    reference: day.tourBooking.reference,
    tour: {
      title: day.tourBooking.tourTitle,
      titleFr: day.tourBooking.tourTitleFr,
      destination: day.tourBooking.tourDestination,
      destinationFr: day.tourBooking.tourDestinationFr,
      country: day.tourBooking.tourCountry,
      countryFr: day.tourBooking.tourCountryFr,
      image: day.tourBooking.tourImage,
    },
    customer: day.tourBooking.user,
    group: {
      travellerCount: day.tourBooking.travellers,
      passengerSummary: `${day.tourBooking.travellers} traveller${day.tourBooking.travellers === 1 ? '' : 's'}`,
    },
    payment: {
      status: day.tourBooking.paymentStatus,
      executionAllowed: tourBookingExecutable(day.tourBooking),
    },
    day: {
      id: day.id,
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
      timestamps: {
        assignedAt: iso(day.assignedAt),
        acceptedAt: iso(day.acceptedAt),
        driverEnRouteAt: iso(day.driverEnRouteAt),
        driverArrivedAt: iso(day.driverArrivedAt),
        startedAt: iso(day.startedAt),
        completedAt: iso(day.completedAt),
        cancelledAt: iso(day.cancelledAt),
      },
    },
    vehicle: day.assignedFleetVehicle,
    driver: day.assignedDriver,
    stops: orderedStops.map((stop, index) => stopDto(stop, index, orderedStops.length)),
    currentStop: current
      ? stopDto(current, orderedStops.findIndex((stop) => stop.id === current.id), orderedStops.length)
      : null,
    nextStop: next
      ? stopDto(next, orderedStops.findIndex((stop) => stop.id === next.id), orderedStops.length)
      : null,
    progress: {
      completedStopCount,
      totalStopCount,
      currentStopNumber: current ? orderedStops.findIndex((stop) => stop.id === current.id) + 1 : null,
    },
    allowedActions: allowedDriverTourActions(day),
  }
}

export function driverTourWhereForView(driverId: string, view: DriverTripView): Prisma.TourBookingDayWhereInput {
  const base: Prisma.TourBookingDayWhereInput = { assignedDriverId: driverId }
  switch (view) {
    case 'upcoming':
      return { ...base, status: { in: ['assigned'] } }
    case 'active':
      return { ...base, status: { in: ['driver_en_route', 'driver_arrived', 'in_progress'] } }
    case 'completed':
      return { ...base, status: 'completed' }
    case 'all':
    default:
      return base
  }
}

export async function listDriverTourDays(principal: MobilePrincipal, viewValue?: string | null) {
  if (!principal.driverId) return { ok: false as const, code: 'DRIVER_NOT_LINKED' as MobileErrorCode }
  const viewResult = normalizeDriverTripView(viewValue)
  if (!viewResult.ok) return viewResult

  const days = await prisma.tourBookingDay.findMany({
    where: driverTourWhereForView(principal.driverId, viewResult.view),
    orderBy: [{ scheduledDate: 'asc' }, { dayNumber: 'asc' }, { id: 'asc' }],
    include: tourDayInclude,
    take: 100,
  })
  return { ok: true as const, view: viewResult.view, tours: days.map(toDriverTourDayDto) }
}

export async function getDriverTourDay(principal: MobilePrincipal, tourBookingDayId: string) {
  if (!principal.driverId) return { ok: false as const, code: 'DRIVER_NOT_LINKED' as MobileErrorCode }
  const day = await prisma.tourBookingDay.findUnique({
    where: { id: tourBookingDayId },
    include: tourDayInclude,
  })
  if (!day) return { ok: false as const, code: 'TOUR_DAY_NOT_FOUND' as MobileErrorCode }
  if (day.assignedDriverId !== principal.driverId) {
    return { ok: false as const, code: 'TOUR_DAY_NOT_ASSIGNED' as MobileErrorCode }
  }
  return { ok: true as const, day, dto: toDriverTourDayDto(day) }
}

export async function assignTourBookingDay({
  tourBookingDayId,
  driverId,
  fleetVehicleId,
}: {
  tourBookingDayId: string
  driverId?: string | null
  fleetVehicleId?: string | null
}) {
  const day = await prisma.tourBookingDay.findUnique({
    where: { id: tourBookingDayId },
    include: tourDayInclude,
  })
  if (!day) return { ok: false as const, code: 'TOUR_DAY_NOT_FOUND' as MobileErrorCode }
  if (['driver_en_route', 'driver_arrived', 'in_progress', 'completed', 'cancelled'].includes(day.status)) {
    return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }
  }
  if (day.tourBooking.status === 'cancelled') {
    return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }
  }

  const nextDriverId = driverId === undefined ? day.assignedDriverId : driverId
  const nextFleetVehicleId = fleetVehicleId === undefined ? day.assignedFleetVehicleId : fleetVehicleId
  const { startsAt, endsAt } = dayWindow(day.scheduledDate)

  if (nextDriverId && nextDriverId !== day.assignedDriverId) {
    const driver = await prisma.driver.findUnique({ where: { id: nextDriverId } })
    if (!driver || !canDriverReceiveNewAssignment(driver.status)) {
      return { ok: false as const, code: 'DRIVER_INACTIVE' as MobileErrorCode }
    }
    const conflict = await prisma.tourBookingDay.findFirst({
      where: {
        id: { not: tourBookingDayId },
        assignedDriverId: nextDriverId,
        scheduledDate: { gte: startsAt, lte: endsAt },
        status: { notIn: ['completed', 'cancelled'] },
      },
    })
    if (conflict) return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }
    const rideConflict = await prisma.bookingLeg.findFirst({
      where: {
        driverId: nextDriverId,
        departureDate: { gte: startsAt, lte: endsAt },
        status: { notIn: NON_BLOCKING_LEG_STATUSES },
      },
    })
    if (rideConflict) return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }
  }

  if (nextFleetVehicleId && nextFleetVehicleId !== day.assignedFleetVehicleId) {
    const vehicle = await prisma.fleetVehicle.findUnique({ where: { id: nextFleetVehicleId } })
    if (!vehicle || vehicle.status !== 'available') {
      return { ok: false as const, code: 'TOUR_DAY_NOT_READY' as MobileErrorCode }
    }
    const conflict = await prisma.tourBookingDay.findFirst({
      where: {
        id: { not: tourBookingDayId },
        assignedFleetVehicleId: nextFleetVehicleId,
        scheduledDate: { gte: startsAt, lte: endsAt },
        status: { notIn: ['completed', 'cancelled'] },
      },
    })
    if (conflict) return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }
    const rideConflict = await prisma.bookingLeg.findFirst({
      where: {
        fleetVehicleId: nextFleetVehicleId,
        departureDate: { gte: startsAt, lte: endsAt },
        status: { notIn: NON_BLOCKING_LEG_STATUSES },
      },
    })
    if (rideConflict) return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }
  }

  const now = new Date()
  const updated = await prisma.tourBookingDay.update({
    where: { id: tourBookingDayId },
    data: {
      assignedDriverId: nextDriverId,
      assignedFleetVehicleId: nextFleetVehicleId,
      assignedAt: nextDriverId || nextFleetVehicleId ? (day.assignedAt ?? now) : null,
      acceptedAt: nextDriverId !== day.assignedDriverId ? null : day.acceptedAt,
      status: nextDriverId && nextFleetVehicleId ? 'assigned' : 'upcoming',
    },
    include: tourDayInclude,
  })
  return { ok: true as const, day: updated, dto: toDriverTourDayDto(updated) }
}

function ensureActionAllowed(day: TourDayForDto, action: DriverTourAction) {
  return allowedDriverTourActions(day).includes(action)
}

async function maybeCompleteTourBooking(tx: Prisma.TransactionClient, tourBookingId: string, now: Date) {
  const remaining = await tx.tourBookingDay.count({
    where: { tourBookingId, status: { notIn: ['completed', 'cancelled'] } },
  })
  if (remaining === 0) {
    await tx.tourBooking.updateMany({
      where: { id: tourBookingId, status: { notIn: ['cancelled', 'completed'] } },
      data: { status: 'completed', completedAt: now },
    })
    return true
  }
  return false
}

export async function applyDriverTourAction({
  req,
  principal,
  tourBookingDayId,
  action,
  stopId,
}: {
  req: Request
  principal: MobilePrincipal
  tourBookingDayId: string
  action: DriverTourAction
  stopId?: string | null
}) {
  const current = await getDriverTourDay(principal, tourBookingDayId)
  if (!current.ok) return current
  const day = current.day
  if (!day.assignedDriver || !canDriverExecuteAssignedTrip(day.assignedDriver.status)) {
    return { ok: false as const, code: 'DRIVER_INACTIVE' as MobileErrorCode }
  }
  if (!tourBookingExecutable(day.tourBooking)) {
    return { ok: false as const, code: 'TOUR_DAY_NOT_READY' as MobileErrorCode }
  }
  if (!hasPickup(day)) return { ok: false as const, code: 'TOUR_DAY_NOT_READY' as MobileErrorCode }
  if (!ensureActionAllowed(day, action)) {
    if (['complete_stop', 'arrive_stop'].includes(action) && stopId) {
      const stop = day.stops.find((item) => item.id === stopId)
      if (stop?.status === 'completed' || stop?.status === 'arrived') {
        return { ok: true as const, dto: toDriverTourDayDto(day), idempotent: true }
      }
    }
    return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }
  }

  const stop = currentTourStop(day.stops)
  if ((action === 'arrive_stop' || action === 'complete_stop') && (!stop || stop.id !== stopId)) {
    return { ok: false as const, code: 'TOUR_STOP_NOT_CURRENT' as MobileErrorCode }
  }

  const now = new Date()
  const result = await prisma.$transaction(
    async (tx) => {
      let applied = true
      if (action === 'accept') {
        const update = await tx.tourBookingDay.updateMany({
          where: { id: day.id, assignedDriverId: principal.driverId, status: 'assigned', acceptedAt: null },
          data: { acceptedAt: now },
        })
        applied = update.count > 0
      } else if (action === 'decline') {
        const update = await tx.tourBookingDay.updateMany({
          where: { id: day.id, assignedDriverId: principal.driverId, status: 'assigned' },
          data: {
            assignedDriverId: null,
            assignedFleetVehicleId: null,
            assignedAt: null,
            acceptedAt: null,
            status: 'upcoming',
          },
        })
        applied = update.count > 0
      } else if (action === 'start_en_route') {
        const update = await tx.tourBookingDay.updateMany({
          where: { id: day.id, assignedDriverId: principal.driverId, status: 'assigned', acceptedAt: { not: null } },
          data: { status: 'driver_en_route', driverEnRouteAt: now },
        })
        applied = update.count > 0
      } else if (action === 'arrive') {
        const update = await tx.tourBookingDay.updateMany({
          where: { id: day.id, assignedDriverId: principal.driverId, status: 'driver_en_route' },
          data: { status: 'driver_arrived', driverArrivedAt: now },
        })
        applied = update.count > 0
      } else if (action === 'start_day') {
        const update = await tx.tourBookingDay.updateMany({
          where: { id: day.id, assignedDriverId: principal.driverId, status: 'driver_arrived' },
          data: { status: 'in_progress', startedAt: now },
        })
        applied = update.count > 0
        if (!applied) return null
        await tx.tourBooking.updateMany({
          where: { id: day.tourBookingId, status: 'confirmed' },
          data: { status: 'active' },
        })
        const firstStop = currentTourStop(day.stops)
        if (firstStop) {
          await tx.tourStopExecution.updateMany({
            where: { id: firstStop.id, status: 'upcoming' },
            data: { status: 'en_route', enRouteAt: now },
          })
        }
      } else if (action === 'arrive_stop' && stop) {
        const update = await tx.tourStopExecution.updateMany({
          where: { id: stop.id, tourBookingDayId: day.id, status: { in: ['upcoming', 'en_route'] } },
          data: { status: 'arrived', arrivedAt: now },
        })
        applied = update.count > 0
      } else if (action === 'complete_stop' && stop) {
        const update = await tx.tourStopExecution.updateMany({
          where: { id: stop.id, tourBookingDayId: day.id, status: 'arrived' },
          data: { status: 'completed', completedAt: now },
        })
        applied = update.count > 0
        if (!applied) return null
        const next = nextTourStop(day.stops, stop.id)
        if (next) {
          await tx.tourStopExecution.updateMany({
            where: { id: next.id, status: 'upcoming' },
            data: { status: 'en_route', enRouteAt: now },
          })
        }
      } else if (action === 'complete_day') {
        const update = await tx.tourBookingDay.updateMany({
          where: { id: day.id, assignedDriverId: principal.driverId, status: 'in_progress' },
          data: { status: 'completed', completedAt: now },
        })
        applied = update.count > 0
        if (!applied) return null
        await maybeCompleteTourBooking(tx, day.tourBookingId, now)
      }

      if (!applied) return null
      return tx.tourBookingDay.findUniqueOrThrow({ where: { id: day.id }, include: tourDayInclude })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
  if (!result) return { ok: false as const, code: 'TOUR_ACTION_NOT_ALLOWED' as MobileErrorCode }

  await writeAuditLog({
    session: {
      user: { id: principal.userId, email: principal.email },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
    req,
    action: `driver_tour_${action}`,
    entityType: 'TourBookingDay',
    entityId: day.id,
    metadata: {
      actorType: 'driver',
      driverId: principal.driverId,
      tourBookingId: day.tourBookingId,
      stopId: stopId ?? null,
    },
  })

  return { ok: true as const, dto: toDriverTourDayDto(result), idempotent: false }
}
