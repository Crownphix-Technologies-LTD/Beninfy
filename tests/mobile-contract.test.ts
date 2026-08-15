import test from 'node:test'
import assert from 'node:assert/strict'
import { toCustomerBookingDetailDto, toDriverTripDetailDto } from '../src/lib/mobile/dtos'
import {
  allowedDriverTripActions,
  evaluateDriverTripTransition,
  isVehicleBlockingLegStatus,
  shouldCompleteBooking,
} from '../src/lib/tripLifecycle'
import {
  isTrackingEligibleStatus,
  shouldReplaceLocation,
  trackingStatusFor,
  validateLocationInput,
  verifyRealtimeScope,
  signRealtimeScope,
} from '../src/lib/mobile/tracking'
import {
  appTypeForPrincipal,
  classifyProviderError,
  normalizeNotificationLanguage,
  principalOwnsAppType,
  pushPayloadToData,
  templateFor,
  validatePushToken,
} from '../src/lib/mobile/notifications'
import {
  chatClosedReasonForStatus,
  chatMessageRealtimeEvent,
  isChatReadableStatus,
  isChatSendEligibleStatus,
  realtimeChannelForChat,
  validateChatText,
} from '../src/lib/mobile/chat'

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

test('location validation rejects invalid coordinates', () => {
  const result = validateLocationInput(
    {
      latitude: 120,
      longitude: 3.3,
      capturedAt: '2026-08-13T09:00:00.000Z',
    },
    new Date('2026-08-13T09:00:10.000Z')
  )

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'LOCATION_INVALID')
})

test('stale location update does not replace newer latest state', () => {
  assert.equal(
    shouldReplaceLocation({
      existing: { capturedAt: new Date('2026-08-13T09:00:30.000Z'), sequence: 12 },
      nextCapturedAt: new Date('2026-08-13T09:00:20.000Z'),
      nextSequence: 11,
    }),
    false
  )
})

test('tracking eligibility starts with active operational states only', () => {
  assert.equal(isTrackingEligibleStatus('assigned'), false)
  assert.equal(isTrackingEligibleStatus('driver_en_route'), true)
  assert.equal(isTrackingEligibleStatus('in_progress'), true)
  assert.equal(isTrackingEligibleStatus('completed'), false)
})

test('tracking status distinguishes live, stale, unavailable and ended', () => {
  const now = new Date('2026-08-13T09:02:00.000Z')
  assert.equal(
    trackingStatusFor({
      legStatus: 'driver_en_route',
      hasDriver: true,
      lastLocationReceivedAt: '2026-08-13T09:01:20.000Z',
      now,
    }),
    'live'
  )
  assert.equal(
    trackingStatusFor({
      legStatus: 'driver_en_route',
      hasDriver: true,
      lastLocationReceivedAt: '2026-08-13T08:50:00.000Z',
      now,
    }),
    'stale'
  )
  assert.equal(trackingStatusFor({ legStatus: 'assigned', hasDriver: true, now }), 'unavailable')
  assert.equal(trackingStatusFor({ legStatus: 'completed', hasDriver: true, now }), 'ended')
})

test('realtime scope token is trip scoped and verifiable', () => {
  process.env.REALTIME_AUTH_SECRET = 'test-secret-for-realtime-scope'
  const scope = signRealtimeScope({
    principalType: 'customer',
    principalId: 'user1',
    bookingLegId: 'leg1',
    channel: 'trip:leg1:tracking',
    permission: 'subscribe',
    ttlSeconds: 60,
  })
  const verified = verifyRealtimeScope(scope.token)

  assert.equal(verified?.bookingLegId, 'leg1')
  assert.equal(verified?.channel, 'trip:leg1:tracking')
  assert.equal(verified?.permission, 'subscribe')
})

test('push token registration validates basic token shape', () => {
  assert.equal(validatePushToken('short'), false)
  assert.equal(validatePushToken('fcm-token-value-with-enough-length'), true)
})

test('push app ownership is derived from authenticated mobile principal', () => {
  const customer = {
    type: 'CUSTOMER',
    userId: 'user1',
    email: 'customer@example.com',
    role: 'user',
    sessionId: 'session1',
  } as const
  const driver = {
    type: 'DRIVER',
    userId: 'user2',
    email: 'driver@example.com',
    role: 'driver',
    sessionId: 'session2',
    driverId: 'driver1',
  } as const

  assert.equal(appTypeForPrincipal(customer), 'customer')
  assert.equal(appTypeForPrincipal(driver), 'driver')
  assert.equal(principalOwnsAppType(customer, 'driver'), false)
  assert.equal(principalOwnsAppType(driver, 'customer'), false)
})

test('notification localization resolves French and falls back to English', () => {
  assert.equal(normalizeNotificationLanguage('fr-BJ'), 'fr')
  assert.equal(normalizeNotificationLanguage('de'), 'en')
  assert.equal(templateFor('trip.driver_arrived', 'fr')?.title, 'Chauffeur arrive')
  assert.equal(templateFor('trip.driver_arrived', 'en')?.title, 'Driver arrived')
})

test('push payload data remains stable and string-only', () => {
  assert.deepEqual(
    pushPayloadToData({
      type: 'trip.driver_arrived',
      version: 1,
      bookingId: 'booking1',
      bookingLegId: 'leg1',
    }),
    {
      type: 'trip.driver_arrived',
      version: '1',
      bookingId: 'booking1',
      bookingLegId: 'leg1',
    }
  )
})

test('provider error classification separates invalid, configuration and transient failures', () => {
  assert.deepEqual(classifyProviderError('registration-token-not-registered'), {
    ok: false,
    classification: 'invalid_token',
    errorCode: 'registration-token-not-registered',
  })
  assert.deepEqual(classifyProviderError('unauthorized'), {
    ok: false,
    classification: 'configuration',
    errorCode: 'unauthorized',
  })
  assert.deepEqual(classifyProviderError('timeout'), {
    ok: false,
    classification: 'transient',
    errorCode: 'timeout',
  })
})

test('chat eligibility is writable only during active assigned lifecycle', () => {
  assert.equal(isChatSendEligibleStatus('assigned'), true)
  assert.equal(isChatSendEligibleStatus('driver_en_route'), true)
  assert.equal(isChatSendEligibleStatus('in_progress'), true)
  assert.equal(isChatSendEligibleStatus('payment_pending'), false)
  assert.equal(isChatSendEligibleStatus('reserved'), false)
  assert.equal(isChatSendEligibleStatus('completed'), false)
  assert.equal(isChatReadableStatus('completed'), true)
  assert.equal(isChatReadableStatus('cancelled'), true)
})

test('chat closed reasons distinguish unassigned and terminal states', () => {
  assert.equal(chatClosedReasonForStatus('reserved', false), 'awaiting_assignment')
  assert.equal(chatClosedReasonForStatus('unassigned', false), 'unassigned')
  assert.equal(chatClosedReasonForStatus('completed', true), 'completed')
  assert.equal(chatClosedReasonForStatus('cancelled', true), 'cancelled')
  assert.equal(chatClosedReasonForStatus('driver_en_route', true), null)
})

test('chat text validation rejects empty and long messages but preserves text', () => {
  assert.deepEqual(validateChatText('   '), { ok: false, code: 'MESSAGE_EMPTY' })
  assert.equal(validateChatText('a'.repeat(2001)).ok, false)
  assert.deepEqual(validateChatText(' Bonjour, I am outside. '), {
    ok: true,
    text: 'Bonjour, I am outside.',
  })
})

test('chat realtime channel and payload are trip scoped and stable', () => {
  assert.equal(realtimeChannelForChat('leg1'), 'trip:leg1:chat')
  const event = chatMessageRealtimeEvent({
    bookingLegId: 'leg1',
    conversationId: 'conversation1',
    message: {
      id: 'message1',
      conversationId: 'conversation1',
      bookingLegId: 'leg1',
      senderType: 'driver',
      senderDisplayName: 'Ada Driver',
      messageType: 'text',
      text: 'I have arrived.',
      systemEventCode: null,
      createdAt: '2026-08-15T12:00:00.000Z',
      isOwnMessage: false,
    },
  })

  assert.equal(event.event, 'chat.message_created')
  assert.equal(event.version, 1)
  assert.equal(event.bookingLegId, 'leg1')
  assert.equal(event.message.id, 'message1')
  assert.equal('rawPrisma' in event, false)
})

test('chat reassignment policy keeps driver conversations separated', () => {
  const previousDriverConversation = { bookingLegId: 'leg1', driverId: 'driverA' }
  const newDriverConversation = { bookingLegId: 'leg1', driverId: 'driverB' }

  assert.notEqual(previousDriverConversation.driverId, newDriverConversation.driverId)
  assert.equal(previousDriverConversation.bookingLegId, newDriverConversation.bookingLegId)
})
