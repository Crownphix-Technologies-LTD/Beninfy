import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateDriverTripTransition } from '../src/lib/mobile/tripTransitions'
import { toCustomerBookingDetailDto, toDriverTripDetailDto } from '../src/lib/mobile/dtos'

test('driver transition blocks terminal trips', () => {
  const result = evaluateDriverTripTransition({
    status: 'completed',
    action: 'dispatch',
    hasFleetVehicle: true,
  })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'INVALID_TRANSITION')
})

test('driver transition requires assigned vehicle for dispatch', () => {
  const result = evaluateDriverTripTransition({
    status: 'assigned',
    action: 'dispatch',
    hasFleetVehicle: false,
  })

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'VEHICLE_NOT_ASSIGNED')
})

test('driver transition allows assigned to dispatched', () => {
  const result = evaluateDriverTripTransition({
    status: 'assigned',
    action: 'dispatch',
    hasFleetVehicle: true,
  })

  assert.deepEqual(result, { ok: true, nextStatus: 'dispatched' })
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
