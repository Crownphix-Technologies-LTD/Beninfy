import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import DriverSearchControls from '../src/components/admin/DriverSearchControls'
import {
  canStartDriverSearch,
  driverAssignmentStatus,
  driverSearchStatusAfterLegUpdate,
} from '../src/lib/driverAssignmentStatus'
import { toCustomerBookingDetailDto, toCustomerTrackingSnapshotDto } from '../src/lib/mobile/dtos'
import { BOOKING_LEG_STATUSES } from '../src/lib/tripLifecycle'

const base = {
  bookingStatus: 'confirmed',
  status: 'reserved',
  driverId: null as string | null,
  driverSearchStatus: 'idle',
}
const cases: Array<[string, Partial<typeof base>, string]> = [
  [
    'payment pending',
    { bookingStatus: 'pending', status: 'payment_pending', driverSearchStatus: 'searching' },
    'not_searching',
  ],
  [
    'confirmed but leg not ready',
    { status: 'payment_pending', driverSearchStatus: 'searching' },
    'not_searching',
  ],
  ['future reserved before dispatch', {}, 'not_searching'],
  ['unassigned before explicit dispatch', { status: 'unassigned' }, 'not_searching'],
  ['explicitly searching', { driverSearchStatus: 'searching' }, 'searching'],
  [
    'explicitly searching unassigned',
    { status: 'unassigned', driverSearchStatus: 'searching' },
    'searching',
  ],
  ['fleet-only idle assignment', { status: 'assigned' }, 'not_searching'],
  [
    'fleet-only assignment during search',
    { status: 'assigned', driverSearchStatus: 'searching' },
    'searching',
  ],
  [
    'real driver assigned without acceptance or location',
    { status: 'assigned', driverId: 'driver1' },
    'assigned',
  ],
  [
    'real driver wins even with stale searching input',
    { driverId: 'driver1', driverSearchStatus: 'searching' },
    'assigned',
  ],
  ['legacy dispatched', { status: 'dispatched', driverId: 'driver1' }, 'assigned'],
  ['en route', { status: 'driver_en_route', driverId: 'driver1' }, 'assigned'],
  ['arrived', { status: 'driver_arrived', driverId: 'driver1' }, 'assigned'],
  ['onboard', { status: 'passenger_onboard', driverId: 'driver1' }, 'assigned'],
  ['in progress', { status: 'in_progress', driverId: 'driver1' }, 'assigned'],
  [
    'completed leg',
    { status: 'completed', driverId: 'driver1', driverSearchStatus: 'searching' },
    'not_searching',
  ],
  ['cancelled leg', { status: 'cancelled', driverSearchStatus: 'searching' }, 'not_searching'],
  [
    'cancelled booking overrides stale leg',
    { bookingStatus: 'cancelled', driverSearchStatus: 'searching' },
    'not_searching',
  ],
  [
    'completed booking overrides stale leg',
    { bookingStatus: 'completed', driverId: 'driver1' },
    'not_searching',
  ],
  [
    'availability conflict / operations review',
    { bookingStatus: 'ops_review', driverSearchStatus: 'searching' },
    'not_searching',
  ],
  [
    'unknown future lifecycle state fails closed',
    { status: 'unknown', driverSearchStatus: 'searching' },
    'not_searching',
  ],
]

for (const [name, overrides, expected] of cases) {
  test('Customer detail and tracking: ' + name, () => {
    process.env.REALTIME_AUTH_SECRET = 'driver-search-contract-test'
    const input = { ...base, ...overrides }
    const leg = {
      ...input,
      id: 'leg1',
      bookingId: 'booking1',
      direction: 'outbound',
      from: 'Lagos',
      to: 'Cotonou',
      departureDate: new Date('2099-01-01'),
      vehicleId: 'saloon',
      fleetVehicle: null,
      latestLocation: null,
      driver: input.driverId
        ? { id: input.driverId, name: 'Driver', phone: '+229000', email: null, status: 'available' }
        : null,
    }
    const detail = toCustomerBookingDetailDto({
      id: leg.bookingId,
      from: leg.from,
      to: leg.to,
      date: leg.departureDate,
      returnDate: null,
      tripType: 'one_way',
      passengers: 1,
      status: input.bookingStatus,
      priceNGN: 10000,
      pickupAddress: null,
      dropoffAddress: null,
      passengerName: null,
      passengerEmail: null,
      passengerPhone: null,
      legs: [leg],
      payments: [],
    })
    const snapshot = toCustomerTrackingSnapshotDto({
      bookingId: leg.bookingId,
      bookingStatus: input.bookingStatus,
      principalId: 'customer1',
      leg,
    })
    assert.equal(driverAssignmentStatus(input), expected)
    assert.equal(detail.legs[0].driverAssignmentStatus, expected)
    assert.equal(snapshot.driverAssignmentStatus, expected)
    assert.equal(snapshot.lastLocation, null)
    if (expected === 'assigned') assert.equal(snapshot.trackingStatus, 'unavailable')
    assert.equal('driverSearchStatus' in detail.legs[0], false)
    assert.equal('driverSearchStatus' in snapshot, false)
  })
}

test('missing Driver alone never produces searching for any Ride lifecycle state', () => {
  for (const bookingStatus of ['pending', 'confirmed', 'ops_review', 'cancelled', 'completed']) {
    for (const status of BOOKING_LEG_STATUSES) {
      assert.equal(driverAssignmentStatus({ ...base, bookingStatus, status }), 'not_searching')
    }
  }
})

test('Start Search only admits confirmed pre-execution legs with no Driver', () => {
  for (const status of BOOKING_LEG_STATUSES) {
    const expected = ['reserved', 'unassigned', 'assigned'].includes(status)
    assert.equal(canStartDriverSearch({ ...base, status }), expected)
    assert.equal(canStartDriverSearch({ ...base, status, driverId: 'driver1' }), false)
    assert.equal(canStartDriverSearch({ ...base, status, bookingStatus: 'ops_review' }), false)
  }
})

test('assignment, reassignment, removal and non-dispatchable status writes clear persisted search', () => {
  assert.equal(driverSearchStatusAfterLegUpdate({ driverId: 'driver1' }), 'idle')
  assert.equal(driverSearchStatusAfterLegUpdate({ driverId: 'driver2' }), 'idle')
  assert.equal(driverSearchStatusAfterLegUpdate({ driverId: null }), 'idle')
  for (const status of BOOKING_LEG_STATUSES) {
    assert.equal(
      driverSearchStatusAfterLegUpdate({ status }),
      ['reserved', 'unassigned', 'assigned'].includes(status) ? undefined : 'idle'
    )
  }
})

test('Operations search actions remain privileged and separate from assignment payloads', () => {
  const source = readFileSync('src/app/api/admin/booking-legs/[id]/route.ts', 'utf8')
  assert.ok(
    source.indexOf("requireAdminPermission('bookings')") <
      source.indexOf('await changeDriverSearch(')
  )
  assert.ok(source.includes('if (!guard.ok) return guard.response'))
  assert.match(source, /Search actions must be sent separately/)
  assert.match(source, /driverSearchStatus: driverSearchStatusAfterLegUpdate/)
})

test('Backoffice shows only valid Start/Stop controls and the explicit state', () => {
  const render = (overrides: Partial<typeof base>, disabled = false) => {
    const input = { ...base, ...overrides }
    return renderToStaticMarkup(
      createElement(DriverSearchControls, {
        bookingStatus: input.bookingStatus,
        leg: input,
        disabled,
        onAction: () => {},
      })
    )
  }
  assert.match(render({}), /Start Driver Search/)
  assert.match(render({ driverSearchStatus: 'searching' }), /Stop Driver Search/)
  assert.match(render({ driverSearchStatus: 'searching' }), /Searching for Driver/)
  for (const input of [
    { bookingStatus: 'pending' },
    { bookingStatus: 'ops_review' },
    { status: 'completed' },
    { driverId: 'driver1' },
  ]) {
    assert.doesNotMatch(render(input), /<button/)
  }
  assert.match(render({ driverId: 'driver1' }), /Driver assigned/)
  assert.match(render({}, true), /disabled=""/)
})
