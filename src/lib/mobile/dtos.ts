import {
  type CustomerLegState,
  type DriverLegState,
  type DriverTripAction,
  allowedDriverTripActions,
  customerLegState,
  driverLegState,
} from '@/lib/tripLifecycle'
import {
  type TrackingStatus,
  realtimeChannelForTrip,
  signRealtimeScope,
  toLocationDto,
  trackingStatusFor,
} from '@/lib/mobile/tracking'
import { type MobileOnboardingDto, toMobileOnboardingDto } from '@/lib/mobile/onboarding'
import { classifyDriverTripView, type DriverTripView } from '@/lib/mobile/driverOperations'
import {
  driverAssignmentOutcome,
  driverAssignmentOutcomeLabelKey,
  type DriverAssignmentHistoryOutcome,
} from '@/lib/mobile/driverAssignmentHistory'
import {
  toJourneyIntelligenceDto,
  type JourneyIntelligenceDto,
} from '@/lib/mobile/journeyIntelligence'
import { type MobileSupportConfig } from '@/lib/mobile/supportConfig'

export type MobileBookingStatus = 'pending' | 'confirmed' | 'ops_review' | 'cancelled' | 'completed'

export type MobileBookingLegStatus =
  | 'payment_pending'
  | 'reserved'
  | 'unassigned'
  | 'assigned'
  | 'dispatched'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'passenger_onboard'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type MobilePaymentStatus = 'pending' | 'paid' | 'failed' | 'amount_mismatch'

export type CustomerProfileDto = {
  id: string
  name: string | null
  email: string
  phone: string | null
  image: string | null
  emailVerified: boolean
  locale: string | null
  onboarding: MobileOnboardingDto
}

export type FleetVehicleDto = {
  id: string
  label: string
  plateNumber: string
  color: string | null
  vehicleCategoryId: string
  status: 'available' | 'maintenance' | 'inactive'
}

export type DriverProfileDto = {
  id: string
  name: string
  phone: string
  email: string | null
  image: string | null
  avatarUrl: string | null
  status: 'available' | 'off_duty' | 'inactive'
  dutyStatus: 'available' | 'off_duty' | 'inactive'
  presence: {
    status: 'online' | 'offline'
    lastSeenAt: string
    lastHeartbeatAt: string | null
    currentBookingLegId: string | null
  } | null
}

export type BookingLegDto = {
  id: string
  bookingId: string
  direction: string
  from: string
  to: string
  departureDate: string
  status: MobileBookingLegStatus
  customerStatus: CustomerLegState
  vehicleCategoryId: string
  fleetVehicle: FleetVehicleDto | null
  driver: DriverProfileDto | null
}

export type CustomerBookingSummaryDto = {
  id: string
  reference: string
  from: string
  to: string
  date: string
  returnDate: string | null
  tripType: 'one-way' | 'round-trip'
  passengers: number
  status: MobileBookingStatus
  priceNGN: number
  paymentStatus: MobilePaymentStatus | null
}

export type CustomerBookingDetailDto = CustomerBookingSummaryDto & {
  pickupAddress: string | null
  pickupCoordinates: { latitude: number; longitude: number } | null
  dropoffAddress: string | null
  dropoffCoordinates: { latitude: number; longitude: number } | null
  passengerName: string | null
  passengerEmail: string | null
  passengerPhone: string | null
  legs: BookingLegDto[]
  payments: PaymentDto[]
}

export type DriverTripSummaryDto = {
  legId: string
  bookingId: string
  reference: string
  view: DriverTripView
  routeDisplayName: string
  direction: string
  from: string
  to: string
  departureDate: string
  status: MobileBookingLegStatus
  driverStatus: DriverLegState
  allowedActions: DriverTripAction[]
  passengerName: string | null
  passengerPhone: string | null
  pickupAddress: string | null
  pickupCoordinates: { latitude: number; longitude: number } | null
  dropoffAddress: string | null
  dropoffCoordinates: { latitude: number; longitude: number } | null
  vehicle: FleetVehicleDto | null
}

export type DriverPassengerManifestEntryDto = {
  sequence: number
  fullName: string
  isLead: boolean
}

export type DriverPassengerManifestDto = {
  totalPassengers: number
  entries: DriverPassengerManifestEntryDto[]
}

export type DriverTripDetailDto = DriverTripSummaryDto & {
  passengers: number
  travelers: DriverPassengerManifestEntryDto[]
  passengerManifest: DriverPassengerManifestDto
  specialRequirements: string | null
  timestamps: {
    assignedAt: string | null
    acceptedAt: string | null
    declinedAt: string | null
    enRouteAt: string | null
    arrivedAt: string | null
    passengerOnboardAt: string | null
    startedAt: string | null
    completedAt: string | null
    cancelledAt: string | null
  }
}

export type DriverAssignmentHistoryDto = {
  assignmentHistoryId: string
  bookingLegId: string
  bookingId: string
  reference: string
  routeDisplayName: string
  direction: string
  from: string
  to: string
  departureDate: string
  outcome: DriverAssignmentHistoryOutcome
  outcomeLabelKey: string
  currentLegStatus: MobileBookingLegStatus
  assignedAt: string
  acceptedAt: string | null
  declinedAt: string | null
  releasedAt: string | null
  completedAt: string | null
  releaseReason: string | null
  releaseSource: string | null
}

export type DriverHomeDto = {
  driver: DriverProfileDto
  notificationUnreadCount: number
  currentActiveTrip: DriverTripSummaryDto | null
  featuredTrip: DriverTripSummaryDto | null
  support: MobileSupportConfig
}

export type PaymentDto = {
  id: string
  bookingId: string
  reference: string
  provider: string
  amountNGN: number
  currencyCode: string
  checkoutAmount: number | null
  status: MobilePaymentStatus
  createdAt: string
  updatedAt: string
}

export type TripTrackingDto = {
  legId: string
  status: MobileBookingLegStatus
  customerStatus: CustomerLegState
  lastKnownLocation: {
    latitude: number
    longitude: number
    recordedAt: string
    accuracyMeters: number | null
  } | null
  vehicle: FleetVehicleDto | null
  driver: Pick<DriverProfileDto, 'id' | 'name' | 'phone'> | null
}

export type TrackingSnapshotDto = {
  bookingId: string
  bookingLegId: string
  trackingStatus: TrackingStatus
  operationalStatus: MobileBookingLegStatus
  customerStatus: CustomerLegState
  driverStatus: DriverLegState
  locationFresh: boolean
  lastLocation: ReturnType<typeof toLocationDto>
  driver: Pick<DriverProfileDto, 'id' | 'name' | 'phone'> | null
  vehicle: FleetVehicleDto | null
  realtime: {
    provider: 'supabase-broadcast'
    channel: string
    token: string
    permission: 'subscribe' | 'publish'
    expiresAt: string
    events: string[]
  } | null
  journeyIntelligence: JourneyIntelligenceDto
}

type Dateish = Date | string

function toIso(value: Dateish) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function displayReference(id: string) {
  return `BFY-${id.slice(-8).toUpperCase()}`
}

function manifestEntriesFromTravelers(input: unknown): DriverPassengerManifestEntryDto[] {
  if (!Array.isArray(input)) return []
  const entries = input
    .map((traveler, index) => {
      if (!traveler || typeof traveler !== 'object') return null
      const record = traveler as Record<string, unknown>
      const fullName =
        typeof record.fullName === 'string'
          ? record.fullName.trim()
          : typeof record.name === 'string'
            ? record.name.trim()
            : ''
      if (!fullName) return null
      const rawSequence = Number(record.sequence)
      return {
        sequence: Number.isInteger(rawSequence) && rawSequence > 0 ? rawSequence : index + 1,
        fullName,
        isLead: record.lead === true || record.isLead === true,
      }
    })
    .filter((entry): entry is DriverPassengerManifestEntryDto => Boolean(entry))
    .sort((left, right) => left.sequence - right.sequence)
  if (entries.length > 0 && !entries.some((entry) => entry.isLead)) {
    entries[0] = { ...entries[0], isLead: true }
  }
  return entries
}

function toDriverPassengerManifest(input: {
  totalPassengers: number
  travelers: unknown
  passengerName: string | null
}): DriverPassengerManifestDto {
  const entries = manifestEntriesFromTravelers(input.travelers)
  if (entries.length === 0 && input.passengerName?.trim()) {
    entries.push({
      sequence: 1,
      fullName: input.passengerName.trim(),
      isLead: true,
    })
  }
  return {
    totalPassengers: input.totalPassengers,
    entries,
  }
}

function normalizeTripType(value: string): 'one-way' | 'round-trip' {
  return value === 'round_trip' || value === 'round-trip' ? 'round-trip' : 'one-way'
}

export function toCustomerProfileDto(user: {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  image?: string | null
  emailVerified?: Date | string | null
  locale?: string | null
}): CustomerProfileDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? '',
    phone: user.phone,
    image: user.image ?? null,
    emailVerified: Boolean(user.emailVerified),
    locale: user.locale ?? null,
    onboarding: toMobileOnboardingDto({
      phone: user.phone,
      emailVerified: user.emailVerified ?? null,
    }),
  }
}

export function toFleetVehicleDto(fleetVehicle: {
  id: string
  label: string
  plateNumber: string
  color: string | null
  vehicleId: string
  status: string
}): FleetVehicleDto {
  return {
    id: fleetVehicle.id,
    label: fleetVehicle.label,
    plateNumber: fleetVehicle.plateNumber,
    color: fleetVehicle.color,
    vehicleCategoryId: fleetVehicle.vehicleId,
    status: fleetVehicle.status as FleetVehicleDto['status'],
  }
}

export function toDriverProfileDto(driver: {
  id: string
  name: string
  phone: string
  email: string | null
  image?: string | null
  user?: { image?: string | null } | null
  status: string
  presence?: {
    status: string
    lastSeenAt: Dateish
    lastHeartbeatAt: Dateish | null
    currentBookingLegId: string | null
  } | null
}): DriverProfileDto {
  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
    email: driver.email,
    image: driver.image ?? driver.user?.image ?? null,
    avatarUrl: driver.image ?? driver.user?.image ?? null,
    status: driver.status as DriverProfileDto['status'],
    dutyStatus: driver.status as DriverProfileDto['dutyStatus'],
    presence: driver.presence
      ? {
          status: driver.presence.status as 'online' | 'offline',
          lastSeenAt: toIso(driver.presence.lastSeenAt),
          lastHeartbeatAt: driver.presence.lastHeartbeatAt
            ? toIso(driver.presence.lastHeartbeatAt)
            : null,
          currentBookingLegId: driver.presence.currentBookingLegId,
        }
      : null,
  }
}

export function toPaymentDto(payment: {
  id: string
  bookingId: string
  reference: string
  provider: string
  amountNGN: number
  currencyCode: string
  checkoutAmount: number | null
  status: string
  createdAt: Dateish
  updatedAt: Dateish
}): PaymentDto {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    reference: payment.reference,
    provider: payment.provider,
    amountNGN: payment.amountNGN,
    currencyCode: payment.currencyCode,
    checkoutAmount: payment.checkoutAmount,
    status: payment.status as MobilePaymentStatus,
    createdAt: toIso(payment.createdAt),
    updatedAt: toIso(payment.updatedAt),
  }
}

export function toBookingLegDto(leg: {
  id: string
  bookingId: string
  direction: string
  from: string
  to: string
  departureDate: Dateish
  status: string
  vehicleId: string
  fleetVehicle: Parameters<typeof toFleetVehicleDto>[0] | null
  driver: Parameters<typeof toDriverProfileDto>[0] | null
}): BookingLegDto {
  return {
    id: leg.id,
    bookingId: leg.bookingId,
    direction: leg.direction,
    from: leg.from,
    to: leg.to,
    departureDate: toIso(leg.departureDate),
    status: leg.status as MobileBookingLegStatus,
    customerStatus: customerLegState(leg.status),
    vehicleCategoryId: leg.vehicleId,
    fleetVehicle: leg.fleetVehicle ? toFleetVehicleDto(leg.fleetVehicle) : null,
    driver: leg.driver ? toDriverProfileDto(leg.driver) : null,
  }
}

export function toCustomerBookingSummaryDto(booking: {
  id: string
  from: string
  to: string
  date: Dateish
  returnDate: Dateish | null
  tripType: string
  passengers: number
  status: string
  priceNGN: number
  payments?: Array<{ status: string; createdAt: Dateish }>
}): CustomerBookingSummaryDto {
  const latestPayment = booking.payments?.slice().sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })[0]

  return {
    id: booking.id,
    reference: displayReference(booking.id),
    from: booking.from,
    to: booking.to,
    date: toIso(booking.date),
    returnDate: booking.returnDate ? toIso(booking.returnDate) : null,
    tripType: normalizeTripType(booking.tripType),
    passengers: booking.passengers,
    status: booking.status as MobileBookingStatus,
    priceNGN: booking.priceNGN,
    paymentStatus: latestPayment ? (latestPayment.status as MobilePaymentStatus) : null,
  }
}

export function toCustomerBookingDetailDto(
  booking: Parameters<typeof toCustomerBookingSummaryDto>[0] & {
    pickupAddress: string | null
    pickupLatitude?: number | null
    pickupLongitude?: number | null
    dropoffAddress: string | null
    dropoffLatitude?: number | null
    dropoffLongitude?: number | null
    passengerName: string | null
    passengerEmail: string | null
    passengerPhone: string | null
    legs: Parameters<typeof toBookingLegDto>[0][]
    payments: Parameters<typeof toPaymentDto>[0][]
  }
): CustomerBookingDetailDto {
  return {
    ...toCustomerBookingSummaryDto(booking),
    pickupAddress: booking.pickupAddress,
    pickupCoordinates:
      typeof booking.pickupLatitude === 'number' && typeof booking.pickupLongitude === 'number'
        ? { latitude: booking.pickupLatitude, longitude: booking.pickupLongitude }
        : null,
    dropoffAddress: booking.dropoffAddress,
    dropoffCoordinates:
      typeof booking.dropoffLatitude === 'number' && typeof booking.dropoffLongitude === 'number'
        ? { latitude: booking.dropoffLatitude, longitude: booking.dropoffLongitude }
        : null,
    passengerName: booking.passengerName,
    passengerEmail: booking.passengerEmail,
    passengerPhone: booking.passengerPhone,
    legs: booking.legs.map(toBookingLegDto),
    payments: booking.payments.map(toPaymentDto),
  }
}

export function toDriverTripSummaryDto(leg: {
  id: string
  bookingId: string
  direction: string
  from: string
  to: string
  departureDate: Dateish
  status: string
  driverId?: string | null
  fleetVehicle: Parameters<typeof toFleetVehicleDto>[0] | null
  booking: {
    status?: string
    passengerName: string | null
    passengerPhone: string | null
    pickupAddress: string | null
    pickupLatitude?: number | null
    pickupLongitude?: number | null
    dropoffAddress: string | null
    dropoffLatitude?: number | null
    dropoffLongitude?: number | null
  }
}): DriverTripSummaryDto {
  return {
    legId: leg.id,
    bookingId: leg.bookingId,
    reference: displayReference(leg.bookingId),
    view: classifyDriverTripView(leg.status),
    routeDisplayName: `${leg.from} to ${leg.to}`,
    direction: leg.direction,
    from: leg.from,
    to: leg.to,
    departureDate: toIso(leg.departureDate),
    status: leg.status as MobileBookingLegStatus,
    driverStatus: driverLegState(leg.status),
    allowedActions: allowedDriverTripActions({
      status: leg.status,
      hasDriver: Boolean(leg.driverId),
      hasFleetVehicle: Boolean(leg.fleetVehicle),
      bookingStatus: leg.booking.status ?? 'confirmed',
    }),
    passengerName: leg.booking.passengerName,
    passengerPhone: leg.booking.passengerPhone,
    pickupAddress: leg.booking.pickupAddress,
    pickupCoordinates:
      typeof leg.booking.pickupLatitude === 'number' &&
      typeof leg.booking.pickupLongitude === 'number'
        ? { latitude: leg.booking.pickupLatitude, longitude: leg.booking.pickupLongitude }
        : null,
    dropoffAddress: leg.booking.dropoffAddress,
    dropoffCoordinates:
      typeof leg.booking.dropoffLatitude === 'number' &&
      typeof leg.booking.dropoffLongitude === 'number'
        ? { latitude: leg.booking.dropoffLatitude, longitude: leg.booking.dropoffLongitude }
        : null,
    vehicle: leg.fleetVehicle ? toFleetVehicleDto(leg.fleetVehicle) : null,
  }
}

export function toDriverTripDetailDto(
  leg: Parameters<typeof toDriverTripSummaryDto>[0] & {
    assignedAt?: Dateish | null
    acceptedAt?: Dateish | null
    declinedAt?: Dateish | null
    enRouteAt?: Dateish | null
    arrivedAt?: Dateish | null
    passengerOnboardAt?: Dateish | null
    startedAt?: Dateish | null
    completedAt?: Dateish | null
    cancelledAt?: Dateish | null
    booking: Parameters<typeof toDriverTripSummaryDto>[0]['booking'] & {
      passengers: number
      travelers: unknown
      specialRequirements: string | null
    }
  }
): DriverTripDetailDto {
  const passengerManifest = toDriverPassengerManifest({
    totalPassengers: leg.booking.passengers,
    travelers: leg.booking.travelers,
    passengerName: leg.booking.passengerName,
  })
  return {
    ...toDriverTripSummaryDto(leg),
    passengers: leg.booking.passengers,
    travelers: passengerManifest.entries,
    passengerManifest,
    specialRequirements: leg.booking.specialRequirements,
    timestamps: {
      assignedAt: leg.assignedAt ? toIso(leg.assignedAt) : null,
      acceptedAt: leg.acceptedAt ? toIso(leg.acceptedAt) : null,
      declinedAt: leg.declinedAt ? toIso(leg.declinedAt) : null,
      enRouteAt: leg.enRouteAt ? toIso(leg.enRouteAt) : null,
      arrivedAt: leg.arrivedAt ? toIso(leg.arrivedAt) : null,
      passengerOnboardAt: leg.passengerOnboardAt ? toIso(leg.passengerOnboardAt) : null,
      startedAt: leg.startedAt ? toIso(leg.startedAt) : null,
      completedAt: leg.completedAt ? toIso(leg.completedAt) : null,
      cancelledAt: leg.cancelledAt ? toIso(leg.cancelledAt) : null,
    },
  }
}

export function toDriverAssignmentHistoryDto(record: {
  id: string
  bookingLegId: string
  driverId: string
  assignedAt: Dateish
  acceptedAt?: Dateish | null
  declinedAt?: Dateish | null
  releasedAt?: Dateish | null
  completedAt?: Dateish | null
  supersededAt?: Dateish | null
  releaseReason?: string | null
  releaseSource?: string | null
  bookingLeg: {
    id: string
    bookingId: string
    direction: string
    from: string
    to: string
    departureDate: Dateish
    status: string
  }
}): DriverAssignmentHistoryDto {
  const outcome = driverAssignmentOutcome(record)
  return {
    assignmentHistoryId: record.id,
    bookingLegId: record.bookingLegId,
    bookingId: record.bookingLeg.bookingId,
    reference: displayReference(record.bookingLeg.bookingId),
    routeDisplayName: `${record.bookingLeg.from} to ${record.bookingLeg.to}`,
    direction: record.bookingLeg.direction,
    from: record.bookingLeg.from,
    to: record.bookingLeg.to,
    departureDate: toIso(record.bookingLeg.departureDate),
    outcome,
    outcomeLabelKey: driverAssignmentOutcomeLabelKey(outcome),
    currentLegStatus: record.bookingLeg.status as MobileBookingLegStatus,
    assignedAt: toIso(record.assignedAt),
    acceptedAt: record.acceptedAt ? toIso(record.acceptedAt) : null,
    declinedAt: record.declinedAt ? toIso(record.declinedAt) : null,
    releasedAt: record.releasedAt ? toIso(record.releasedAt) : null,
    completedAt: record.completedAt ? toIso(record.completedAt) : null,
    releaseReason: record.releaseReason ?? null,
    releaseSource: record.releaseSource ?? null,
  }
}

export function toCustomerTrackingSnapshotDto({
  bookingId,
  principalId,
  leg,
}: {
  bookingId: string
  principalId: string
  leg: {
    id: string
    bookingId: string
    status: string
    driverId: string | null
    fleetVehicle: Parameters<typeof toFleetVehicleDto>[0] | null
    driver: Parameters<typeof toDriverProfileDto>[0] | null
    latestLocation: Parameters<typeof toLocationDto>[0] | null
    journeySnapshot?: Parameters<typeof toJourneyIntelligenceDto>[0] | null
  }
}): TrackingSnapshotDto {
  const trackingStatus = trackingStatusFor({
    legStatus: leg.status,
    hasDriver: Boolean(leg.driverId),
    lastLocationReceivedAt: leg.latestLocation?.receivedAt,
    lastLocationExpiresAt: leg.latestLocation?.expiresAt,
  })
  const channel = realtimeChannelForTrip(leg.id)
  const realtime =
    leg.driverId && trackingStatus !== 'ended'
      ? signRealtimeScope({
          principalType: 'customer',
          principalId,
          bookingLegId: leg.id,
          channel,
          permission: 'subscribe',
        })
      : null

  return {
    bookingId,
    bookingLegId: leg.id,
    trackingStatus,
    operationalStatus: leg.status as MobileBookingLegStatus,
    customerStatus: customerLegState(leg.status),
    driverStatus: driverLegState(leg.status),
    locationFresh: trackingStatus === 'live',
    lastLocation:
      trackingStatus === 'live' || trackingStatus === 'stale'
        ? toLocationDto(leg.latestLocation)
        : null,
    driver: leg.driver
      ? { id: leg.driver.id, name: leg.driver.name, phone: leg.driver.phone }
      : null,
    vehicle: leg.fleetVehicle ? toFleetVehicleDto(leg.fleetVehicle) : null,
    realtime: realtime
      ? {
          ...realtime,
          events: [
            'trip.location_updated',
            'trip.driver_en_route',
            'trip.driver_arrived',
            'trip.passenger_onboard',
            'trip.in_progress',
            'trip.completed',
            'trip.cancelled',
            'trip.assignment_changed',
          ],
        }
      : null,
    journeyIntelligence: toJourneyIntelligenceDto(leg.journeySnapshot ?? null),
  }
}

export function toDriverTrackingSnapshotDto({
  principalId,
  leg,
}: {
  principalId: string
  leg: {
    id: string
    bookingId: string
    status: string
    driverId: string | null
    fleetVehicle: Parameters<typeof toFleetVehicleDto>[0] | null
    driver: Parameters<typeof toDriverProfileDto>[0] | null
    latestLocation: Parameters<typeof toLocationDto>[0] | null
    journeySnapshot?: Parameters<typeof toJourneyIntelligenceDto>[0] | null
  }
}): TrackingSnapshotDto {
  const trackingStatus = trackingStatusFor({
    legStatus: leg.status,
    hasDriver: Boolean(leg.driverId),
    lastLocationReceivedAt: leg.latestLocation?.receivedAt,
    lastLocationExpiresAt: leg.latestLocation?.expiresAt,
  })
  const channel = realtimeChannelForTrip(leg.id)
  const realtime = signRealtimeScope({
    principalType: 'driver',
    principalId,
    bookingLegId: leg.id,
    channel,
    permission: 'publish',
  })

  return {
    bookingId: leg.bookingId,
    bookingLegId: leg.id,
    trackingStatus,
    operationalStatus: leg.status as MobileBookingLegStatus,
    customerStatus: customerLegState(leg.status),
    driverStatus: driverLegState(leg.status),
    locationFresh: trackingStatus === 'live',
    lastLocation:
      trackingStatus === 'live' || trackingStatus === 'stale'
        ? toLocationDto(leg.latestLocation)
        : null,
    driver: leg.driver
      ? { id: leg.driver.id, name: leg.driver.name, phone: leg.driver.phone }
      : null,
    vehicle: leg.fleetVehicle ? toFleetVehicleDto(leg.fleetVehicle) : null,
    realtime: {
      ...realtime,
      events: ['trip.location_updated'],
    },
    journeyIntelligence: toJourneyIntelligenceDto(leg.journeySnapshot ?? null),
  }
}
