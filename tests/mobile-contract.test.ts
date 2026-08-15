import test from 'node:test'
import assert from 'node:assert/strict'
import { toCustomerBookingDetailDto, toDriverTripDetailDto } from '../src/lib/mobile/dtos'
import {
  allowedDriverTripActions,
  evaluateDriverTripTransition,
  isVehicleBlockingLegStatus,
  shouldCompleteBooking,
} from '../src/lib/tripLifecycle'

test('driver transition blocks terminal trips', () => {
  const result = evaluateDriverTripTransition({
    status: 'completed',
    action: 'start_en_route',
    hasDriver: true,
    hasFleetVehicle: true,
    bookingStatus: 'confirmed',
  })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'TRIP_ALREADY_COMPLETED')
})

test('driver transition requires assigned vehicle to start en route', () => {
  const result = evaluateDriverTripTransition({
    status: 'assigned',
    action: 'start_en_route',
    hasDriver: true,
    hasFleetVehicle: false,
    bookingStatus: 'confirmed',
  })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'VEHICLE_NOT_ASSIGNED')
})

test('driver transition supports full production lifecycle', () => {
  const sequence = [
    ['assigned', 'start_en_route', 'driver_en_route'],
    ['driver_en_route', 'arrive', 'driver_arrived'],
    ['driver_arrived', 'passenger_onboard', 'passenger_onboard'],
    ['passenger_onboard', 'start_trip', 'in_progress'],
    ['in_progress', 'complete', 'completed'],
  ] as const

  for (const [status, action, nextStatus] of sequence) {
    const result = evaluateDriverTripTransition({
      status,
      action,
      hasDriver: true,
      hasFleetVehicle: true,
      bookingStatus: 'confirmed',
    })

    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.nextStatus, nextStatus)
  }
})

test('driver transition prevents skipping from assigned to completed', () => {
  const result = evaluateDriverTripTransition({
    status: 'assigned',
    action: 'complete',
    hasDriver: true,
    hasFleetVehicle: true,
    bookingStatus: 'confirmed',
  })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'ACTION_NOT_ALLOWED')
})

test('driver transition treats duplicate arrive as idempotent success', () => {
  const result = evaluateDriverTripTransition({
    status: 'driver_arrived',
    action: 'arrive',
    hasDriver: true,
    hasFleetVehicle: true,
    bookingStatus: 'confirmed',
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.nextStatus, 'driver_arrived')
    assert.equal(result.idempotent, true)
  }
})

test('driver decline releases assignment without cancelling customer leg', () => {
  const result = evaluateDriverTripTransition({
    status: 'assigned',
    action: 'decline',
    hasDriver: true,
    hasFleetVehicle: true,
    bookingStatus: 'confirmed',
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.nextStatus, 'unassigned')
    assert.equal(result.releaseDriver, true)
  }
})

test('booking completion waits for all round trip legs', () => {
  assert.equal(shouldCompleteBooking(['completed', 'assigned']), false)
  assert.equal(shouldCompleteBooking(['completed', 'completed']), true)
})

test('active lifecycle states keep vehicles blocked', () => {
  for (const status of [
    'assigned',
    'driver_en_route',
    'driver_arrived',
    'passenger_onboard',
    'in_progress',
  ]) {
    assert.equal(isVehicleBlockingLegStatus(status), true)
  }
  for (const status of ['payment_pending', 'completed', 'cancelled']) {
    assert.equal(isVehicleBlockingLegStatus(status), false)
  }
})

test('allowed actions are computed from authoritative lifecycle matrix', () => {
  assert.deepEqual(
    allowedDriverTripActions({
      status: 'driver_arrived',
      hasDriver: true,
      hasFleetVehicle: true,
      bookingStatus: 'confirmed',
    }),
    ['arrive', 'passenger_onboard', 'cancel']
  )
})

test('customer booking DTO excludes internal fields', () => {
  const booking = {
    id: 'booking12345678',
    from: 'Lagos',
    to: 'Cotonou',
    date: new Date('2026-08-13T09:00:00.000Z'),
    returnDate: null,
    tripType: 'one_way',
    passengers: 2,
    status: 'pending',
    priceNGN: 180000,
    pickupAddress: 'Mainland',
    dropoffAddress: 'Cotonou',
    passengerName: 'Ada',
    passengerEmail: 'ada@example.com',
    passengerPhone: '+234000',
    internalNotes: 'must not leak',
    legs: [],
    payments: [],
  }

  const dto = toCustomerBookingDetailDto(booking)

  assert.equal(dto.tripType, 'one-way')
  assert.equal('internalNotes' in dto, false)
})

test('driver trip DTO exposes operational fields and excludes payment metadata', () => {
  const trip = {
    id: 'leg1',
    bookingId: 'booking12345678',
    direction: 'outbound',
    from: 'Lagos',
    to: 'Cotonou',
    departureDate: new Date('2026-08-13T09:00:00.000Z'),
    status: 'assigned',
    driverStatus: 'assigned',
    allowedActions: [],
    fleetVehicle: null,
    paymentProviderMetadata: { secret: true },
    booking: {
      passengerName: 'Ada',
      passengerPhone: '+234000',
      pickupAddress: 'Mainland',
      dropoffAddress: 'Cotonou',
      passengers: 2,
      travelers: [],
      specialRequirements: 'Call on arrival',
    },
  }

  const dto = toDriverTripDetailDto(trip)

  assert.equal(dto.reference, 'BFY-12345678')
  assert.equal(dto.specialRequirements, 'Call on arrival')
  assert.equal('paymentProviderMetadata' in dto, false)
})
