import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ADMIN_LIVE_TRIP_POLL_INTERVAL_MS,
  adminLocationFreshness,
  adminTripCurrentState,
  adminTripTimeline,
  shouldPollAdminLiveTrip,
} from '../src/lib/admin/liveTripMonitoring'

test('admin live trip state distinguishes assigned from accepted', () => {
  assert.equal(adminTripCurrentState({ status: 'assigned' }), 'Driver assigned')
  assert.equal(
    adminTripCurrentState({
      status: 'assigned',
      timestamps: { acceptedAt: '2026-08-28T10:07:00.000Z' },
    }),
    'Driver accepted'
  )
})

test('admin live trip state maps canonical lifecycle statuses only', () => {
  assert.equal(adminTripCurrentState({ status: 'driver_en_route' }), 'Heading to pickup')
  assert.equal(adminTripCurrentState({ status: 'driver_arrived' }), 'Driver arrived')
  assert.equal(adminTripCurrentState({ status: 'passenger_onboard' }), 'Passenger onboard')
  assert.equal(adminTripCurrentState({ status: 'in_progress' }), 'Trip in progress')
  assert.equal(adminTripCurrentState({ status: 'completed' }), 'Trip completed')
  assert.equal(adminTripCurrentState({ status: 'cancelled' }), 'Trip cancelled')
})

test('admin live trip timeline renders completed and pending authoritative steps', () => {
  const timeline = adminTripTimeline({
    status: 'driver_arrived',
    timestamps: {
      assignedAt: '2026-08-28T10:02:00.000Z',
      acceptedAt: '2026-08-28T10:07:00.000Z',
      enRouteAt: '2026-08-28T10:10:00.000Z',
      arrivedAt: '2026-08-28T10:31:00.000Z',
    },
  })

  assert.deepEqual(
    timeline.map((step) => [step.key, step.state, step.timestamp]),
    [
      ['assigned', 'complete', '2026-08-28T10:02:00.000Z'],
      ['accepted', 'complete', '2026-08-28T10:07:00.000Z'],
      ['en_route', 'complete', '2026-08-28T10:10:00.000Z'],
      ['arrived', 'current', '2026-08-28T10:31:00.000Z'],
      ['passenger_onboard', 'pending', null],
      ['started', 'pending', null],
      ['completed', 'pending', null],
    ]
  )
})

test('admin live trip timeline terminates cancellation without fabricating times', () => {
  const timeline = adminTripTimeline({
    status: 'cancelled',
    timestamps: {
      assignedAt: '2026-08-28T10:02:00.000Z',
      cancelledAt: '2026-08-28T10:12:00.000Z',
    },
  })
  const cancelled = timeline.at(-1)

  assert.equal(cancelled?.key, 'cancelled')
  assert.equal(cancelled?.state, 'terminal')
  assert.equal(cancelled?.timestamp, '2026-08-28T10:12:00.000Z')
  assert.equal(timeline.find((step) => step.key === 'completed')?.timestamp, null)
})

test('admin live trip polling is bounded to active non-terminal trips', () => {
  assert.equal(ADMIN_LIVE_TRIP_POLL_INTERVAL_MS, 8000)
  assert.equal(shouldPollAdminLiveTrip('assigned'), true)
  assert.equal(shouldPollAdminLiveTrip('driver_en_route'), true)
  assert.equal(shouldPollAdminLiveTrip('in_progress'), true)
  assert.equal(shouldPollAdminLiveTrip('completed'), false)
  assert.equal(shouldPollAdminLiveTrip('cancelled'), false)
  assert.equal(shouldPollAdminLiveTrip('payment_pending'), false)
})

test('admin location freshness separates unavailable fresh stale and expired', () => {
  const now = new Date('2026-08-28T10:01:40.000Z')

  assert.equal(adminLocationFreshness(null, now).state, 'unavailable')
  assert.equal(
    adminLocationFreshness(
      {
        latitude: 6.5244,
        longitude: 3.3792,
        accuracyMeters: null,
        receivedAt: '2026-08-28T10:01:10.000Z',
        expiresAt: '2026-08-28T10:20:00.000Z',
      },
      now
    ).state,
    'fresh'
  )
  assert.equal(
    adminLocationFreshness(
      {
        latitude: 6.5244,
        longitude: 3.3792,
        accuracyMeters: null,
        receivedAt: '2026-08-28T09:58:00.000Z',
        expiresAt: '2026-08-28T10:20:00.000Z',
      },
      now
    ).state,
    'stale'
  )
  assert.equal(
    adminLocationFreshness(
      {
        latitude: 6.5244,
        longitude: 3.3792,
        accuracyMeters: null,
        receivedAt: '2026-08-28T09:58:00.000Z',
        expiresAt: '2026-08-28T10:00:00.000Z',
      },
      now
    ).state,
    'expired'
  )
})

test('admin bookings contract exposes authoritative lifecycle and latest location fields', () => {
  const route = readFileSync('src/app/api/admin/bookings/route.ts', 'utf8')
  const page = readFileSync('src/app/[locale]/admin/bookings/page.tsx', 'utf8')

  for (const field of ['latestLocation', 'latitude', 'longitude', 'receivedAt', 'expiresAt']) {
    assert.match(route, new RegExp(field))
  }
  for (const field of [
    'assignedAt',
    'acceptedAt',
    'enRouteAt',
    'arrivedAt',
    'passengerOnboardAt',
    'startedAt',
    'completedAt',
    'cancelledAt',
  ]) {
    assert.match(page, new RegExp(field))
  }
})

test('admin live trip UI keeps lifecycle monitoring separate from driver execution controls', () => {
  const component = readFileSync('src/components/admin/LiveTripMonitor.tsx', 'utf8')

  assert.match(component, /h-\[260px\]/)
  assert.match(component, /paymentStatus/)
  assert.doesNotMatch(component, /I have arrived/)
  assert.doesNotMatch(component, /Passenger on board/)
  assert.doesNotMatch(component, /Start trip/)
  assert.doesNotMatch(component, /Complete trip/)
})
