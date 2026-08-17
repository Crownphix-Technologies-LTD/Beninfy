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
import {
  bookingPayable,
  canRetryPayment,
  mobilePaymentState,
  normalizeMobilePaymentProvider,
  toMobilePaymentDto,
} from '../src/lib/mobile/payments'
import {
  hashOtpCode,
  normalizeMobileLocale,
  normalizeMobilePhone,
  toMobileOnboardingDto,
  validateMobilePassword,
  verifyOtpCode,
} from '../src/lib/mobile/onboarding'
import {
  calculateFareBreakdown,
  mobileMoney,
  mobileRouteDetail,
  normalizeDiscoverySelection,
  toMobileRouteDto,
  toMobileVehicleDto,
} from '../src/lib/mobile/bookingDiscovery'
import {
  classifyDriverTripView,
  driverTripOrderByForView,
  driverTripWhereForView,
  isDriverDutyStatus,
  normalizeDriverTripView,
} from '../src/lib/mobile/driverOperations'
import {
  CANCELLATION_NOTE_MAX_LENGTH,
  cancellationReasonCatalogue,
  customerCancellationEligibility,
  isCustomerCancellationBlockedByLegStatus,
  isCustomerCancellationReason,
  normalizeCustomerSettingsLocale,
} from '../src/lib/mobile/customerAccount'
import {
  accountDeleteConfirmation,
  emailChangePolicy,
  PAYMENT_RESOLUTION_STATUSES,
  REVIEW_TAGS,
  SAVED_PLACE_TYPES,
  toPaymentResolutionDto,
  toSavedPlaceDto,
  toTravelPreferenceDto,
  validCoordinates,
} from '../src/lib/mobile/customerProduct'
import { routes } from '../src/data/routes'
import { vehicles } from '../src/data/vehicles'

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

test('mobile payment state is derived from backend booking and payment status', () => {
  assert.equal(
    mobilePaymentState({ bookingStatus: 'ops_review', paymentStatus: 'paid' }),
    'ops_review'
  )
  assert.equal(mobilePaymentState({ bookingStatus: 'pending', paymentStatus: 'paid' }), 'paid')
  assert.equal(
    mobilePaymentState({ bookingStatus: 'pending', paymentStatus: 'amount_mismatch' }),
    'amount_mismatch'
  )
  assert.equal(mobilePaymentState({ bookingStatus: 'pending', paymentStatus: 'failed' }), 'failed')
  assert.equal(
    mobilePaymentState({ bookingStatus: 'pending', paymentStatus: 'pending' }),
    'pending'
  )
})

test('mobile payment retry is blocked for authoritative terminal booking states', () => {
  assert.equal(canRetryPayment({ bookingStatus: 'confirmed', paymentStatus: 'paid' }), false)
  assert.equal(canRetryPayment({ bookingStatus: 'completed', paymentStatus: 'paid' }), false)
  assert.equal(canRetryPayment({ bookingStatus: 'ops_review', paymentStatus: 'paid' }), false)
  assert.equal(canRetryPayment({ bookingStatus: 'pending', paymentStatus: 'failed' }), true)
})

test('mobile payment DTO exposes safe money and checkout fields only', () => {
  const dto = toMobilePaymentDto({
    booking: { id: 'booking1', status: 'pending', priceNGN: 180000 },
    payment: {
      id: 'payment1',
      bookingId: 'booking1',
      amountNGN: 180000,
      status: 'pending',
      reference: 'BFY-M-123',
      provider: 'paystack',
      providerReference: 'BFY-M-123',
      providerCheckoutUrl: 'https://checkout.example',
      providerAccessCode: 'access-code',
      currencyCode: 'NGN',
      checkoutAmount: 180000,
      expiresAt: new Date('2026-08-15T12:30:00.000Z'),
      paidAt: null,
      failureCode: null,
      createdAt: new Date('2026-08-15T12:00:00.000Z'),
      updatedAt: new Date('2026-08-15T12:00:00.000Z'),
    },
  })

  assert.equal(dto.amount.value, 180000)
  assert.equal(dto.amount.currency, 'NGN')
  assert.equal(dto.amount.minorValue, 18000000)
  assert.equal(dto.checkout?.authorizationUrl, 'https://checkout.example')
  assert.equal('secret' in dto, false)
  assert.equal('webhookSignature' in dto, false)
})

test('mobile booking payability and provider normalization are conservative', () => {
  assert.equal(bookingPayable({ status: 'pending', priceNGN: 1 }), true)
  assert.equal(bookingPayable({ status: 'confirmed', priceNGN: 1 }), false)
  assert.equal(bookingPayable({ status: 'pending', priceNGN: 0 }), false)
  assert.equal(normalizeMobilePaymentProvider('payonus'), 'payonus')
  assert.equal(normalizeMobilePaymentProvider('unknown'), 'paystack')
})

test('customer mobile onboarding exposes stable routing states', () => {
  assert.deepEqual(toMobileOnboardingDto({ phone: null, emailVerified: null }), {
    status: 'phone_required',
    nextStep: 'collect_phone',
    phoneRequired: true,
    emailVerified: false,
  })
  assert.deepEqual(toMobileOnboardingDto({ phone: '+22951019134', emailVerified: null }), {
    status: 'email_verification_required',
    nextStep: 'verify_email_otp',
    phoneRequired: false,
    emailVerified: false,
  })
  assert.deepEqual(toMobileOnboardingDto({ phone: '+22951019134', emailVerified: new Date() }), {
    status: 'complete',
    nextStep: 'customer_home',
    phoneRequired: false,
    emailVerified: true,
  })
})

test('customer onboarding accepts supported Benin and Nigeria phone formats', () => {
  assert.equal(normalizeMobilePhone('+229 51 01 91 34'), '+22951019134')
  assert.equal(normalizeMobilePhone('08012345678'), '+2348012345678')
  assert.equal(normalizeMobilePhone('+234 801 234 5678'), '+2348012345678')
  assert.equal(normalizeMobilePhone('+233201234567'), null)
})

test('customer onboarding locale is explicit and conservative', () => {
  assert.equal(normalizeMobileLocale('fr'), 'fr')
  assert.equal(normalizeMobileLocale('en'), 'en')
  assert.equal(normalizeMobileLocale('pt'), 'en')
  assert.equal(normalizeMobileLocale(undefined), 'en')
})

test('email OTP hashes are deterministic and do not verify wrong codes', () => {
  process.env.MOBILE_ONBOARDING_SECRET = 'test-onboarding-secret'
  const expectedHash = hashOtpCode({
    userId: 'user_1',
    targetNormalized: 'customer@example.com',
    code: '123456',
  })

  assert.equal(
    verifyOtpCode({
      expectedHash,
      userId: 'user_1',
      targetNormalized: 'customer@example.com',
      code: '123456',
    }),
    true
  )
  assert.equal(
    verifyOtpCode({
      expectedHash,
      userId: 'user_1',
      targetNormalized: 'customer@example.com',
      code: '654321',
    }),
    false
  )
})

test('mobile password policy is stable for registration and reset', () => {
  assert.equal(validateMobilePassword('1234567'), false)
  assert.equal(validateMobilePassword('stronger-password'), true)
  assert.equal(validateMobilePassword('x'.repeat(101)), false)
})

test('mobile route discovery DTO is customer safe and stable', () => {
  const dto = toMobileRouteDto(routes[0])

  assert.equal(dto.id, 'lagos-cotonou')
  assert.equal(dto.origin.city, 'Lagos')
  assert.equal(dto.destination.city, 'Cotonou')
  assert.equal(dto.displayName, 'Lagos to Cotonou')
  assert.equal(dto.available, true)
  assert.equal('internalCost' in dto, false)
})

test('mobile route detail returns null for unknown routes', () => {
  assert.equal(mobileRouteDetail('lagos-cotonou')?.id, 'lagos-cotonou')
  assert.equal(mobileRouteDetail('unknown-route'), null)
})

test('mobile vehicle discovery DTO exposes capacity and safe pricing fields', () => {
  const dto = toMobileVehicleDto(vehicles[0])

  assert.equal(dto.id, 'saloon')
  assert.equal(dto.capacity, 3)
  assert.equal(dto.available, true)
  assert.equal('plateNumber' in dto, false)
  assert.equal('notes' in dto, false)
})

test('mobile discovery selection validates round trip return dates', () => {
  const missingReturn = normalizeDiscoverySelection({
    routeId: 'lagos-cotonou',
    vehicleId: 'saloon',
    tripType: 'round-trip',
    departureDate: '2026-08-20T09:00:00.000Z',
  })

  assert.equal(missingReturn.ok, false)
  if (!missingReturn.ok) assert.equal(missingReturn.code, 'INVALID_RETURN_DATE')

  const valid = normalizeDiscoverySelection({
    routeId: 'lagos-cotonou',
    vehicleId: 'saloon',
    tripType: 'round-trip',
    departureDate: '2026-08-20T09:00:00.000Z',
    returnDate: '2026-08-22T09:00:00.000Z',
  })

  assert.equal(valid.ok, true)
  if (valid.ok) assert.equal(valid.data.datesToCheck.length, 2)
})

test('mobile fare breakdown doubles only ride fare for round trips', () => {
  assert.deepEqual(
    calculateFareBreakdown({
      oneWayDropoffFare: 180000,
      tripType: 'round-trip',
      borderFeeNGN: 40000,
    }),
    {
      oneWayDropoffFare: 180000,
      legCount: 2,
      rideFareNGN: 360000,
      borderFeeNGN: 40000,
      subtotalNGN: 400000,
    }
  )
})

test('mobile money uses NGN and kobo minor values', () => {
  const money = mobileMoney(180000)

  assert.equal(money.currency, 'NGN')
  assert.equal(money.value, 180000)
  assert.equal(money.minorUnit, 'kobo')
  assert.equal(money.minorValue, 18000000)
  assert.match(money.formatted, /180,000/)
})

test('driver duty status allows only driver-controlled states', () => {
  assert.equal(isDriverDutyStatus('available'), true)
  assert.equal(isDriverDutyStatus('off_duty'), true)
  assert.equal(isDriverDutyStatus('inactive'), false)
  assert.equal(isDriverDutyStatus('online'), false)
})

test('driver trip view normalization is stable', () => {
  assert.deepEqual(normalizeDriverTripView(null), { ok: true, view: 'all' })
  assert.deepEqual(normalizeDriverTripView('upcoming'), { ok: true, view: 'upcoming' })
  assert.deepEqual(normalizeDriverTripView('active'), { ok: true, view: 'active' })
  assert.deepEqual(normalizeDriverTripView('completed'), { ok: true, view: 'completed' })
  assert.deepEqual(normalizeDriverTripView('unknown'), {
    ok: false,
    code: 'INVALID_TRIP_VIEW',
  })
})

test('driver trip lifecycle states classify into mobile dashboard views', () => {
  assert.equal(classifyDriverTripView('assigned'), 'upcoming')
  assert.equal(classifyDriverTripView('driver_en_route'), 'active')
  assert.equal(classifyDriverTripView('driver_arrived'), 'active')
  assert.equal(classifyDriverTripView('passenger_onboard'), 'active')
  assert.equal(classifyDriverTripView('in_progress'), 'active')
  assert.equal(classifyDriverTripView('completed'), 'completed')
  assert.equal(classifyDriverTripView('cancelled'), 'all')
  assert.equal(classifyDriverTripView('unassigned'), 'all')
})

test('driver trip view query scopes by authenticated driver and status', () => {
  assert.deepEqual(driverTripWhereForView('driver1', 'upcoming'), {
    driverId: 'driver1',
    status: { in: ['assigned'] },
  })
  assert.deepEqual(driverTripWhereForView('driver1', 'active'), {
    driverId: 'driver1',
    status: {
      in: ['dispatched', 'driver_en_route', 'driver_arrived', 'passenger_onboard', 'in_progress'],
    },
  })
  assert.deepEqual(driverTripWhereForView('driver1', 'completed'), {
    driverId: 'driver1',
    status: { in: ['completed'] },
  })
})

test('driver trip view sorting is operationally useful', () => {
  assert.deepEqual(driverTripOrderByForView('upcoming'), [{ departureDate: 'asc' }, { id: 'asc' }])
  assert.deepEqual(driverTripOrderByForView('active'), [{ departureDate: 'asc' }, { id: 'asc' }])
  assert.deepEqual(driverTripOrderByForView('completed'), [
    { completedAt: 'desc' },
    { departureDate: 'desc' },
    { id: 'desc' },
  ])
})

test('customer cancellation reason catalogue is stable and localized by key', () => {
  assert.equal(isCustomerCancellationReason('change_of_plans'), true)
  assert.equal(isCustomerCancellationReason('wrong_booking_details'), true)
  assert.equal(isCustomerCancellationReason('random_reason'), false)
  assert.equal(CANCELLATION_NOTE_MAX_LENGTH, 500)
  assert.deepEqual(cancellationReasonCatalogue()[0], {
    code: 'change_of_plans',
    labelKey: 'bookingCancellation.change_of_plans',
  })
})

test('customer cancellation policy rejects active and partial round-trip cases', () => {
  assert.equal(isCustomerCancellationBlockedByLegStatus('driver_en_route'), true)
  assert.equal(isCustomerCancellationBlockedByLegStatus('assigned'), false)
  assert.deepEqual(
    customerCancellationEligibility({
      bookingStatus: 'confirmed',
      legStatuses: ['assigned', 'reserved'],
    }),
    { ok: true, idempotent: false }
  )
  assert.deepEqual(
    customerCancellationEligibility({
      bookingStatus: 'confirmed',
      legStatuses: ['driver_arrived'],
    }),
    { ok: false, code: 'TRIP_ALREADY_STARTED' }
  )
  assert.deepEqual(
    customerCancellationEligibility({
      bookingStatus: 'confirmed',
      legStatuses: ['completed', 'assigned'],
    }),
    { ok: false, code: 'PARTIAL_CANCELLATION_NOT_SUPPORTED' }
  )
})

test('customer cancellation treats duplicate cancellation as idempotent success', () => {
  assert.deepEqual(
    customerCancellationEligibility({
      bookingStatus: 'cancelled',
      legStatuses: ['cancelled'],
    }),
    { ok: true, idempotent: true }
  )
  assert.deepEqual(
    customerCancellationEligibility({
      bookingStatus: 'completed',
      legStatuses: ['completed'],
    }),
    { ok: false, code: 'BOOKING_NOT_CANCELLABLE' }
  )
})

test('customer settings locale accepts only supported mobile locales', () => {
  assert.equal(normalizeCustomerSettingsLocale('en'), 'en')
  assert.equal(normalizeCustomerSettingsLocale('fr'), 'fr')
  assert.equal(normalizeCustomerSettingsLocale('pt'), null)
  assert.equal(normalizeCustomerSettingsLocale(undefined), null)
})

test('saved place contract validates coordinates and stable place types', () => {
  assert.deepEqual(SAVED_PLACE_TYPES, ['home', 'work', 'custom'])
  assert.equal(validCoordinates(6.4281, 3.4219), true)
  assert.equal(validCoordinates(null, null), true)
  assert.equal(validCoordinates(91, 3), false)
  assert.equal(validCoordinates(6, undefined), false)

  assert.deepEqual(
    toSavedPlaceDto({
      id: 'place1',
      type: 'home',
      label: 'Home',
      address: 'Victoria Island, Lagos',
      latitude: 6.4281,
      longitude: 3.4219,
      country: 'Nigeria',
      city: 'Lagos',
      providerPlaceId: 'google1',
      createdAt: new Date('2026-08-17T10:00:00.000Z'),
      updatedAt: new Date('2026-08-17T10:00:00.000Z'),
    }),
    {
      id: 'place1',
      type: 'home',
      label: 'Home',
      address: 'Victoria Island, Lagos',
      latitude: 6.4281,
      longitude: 3.4219,
      country: 'Nigeria',
      city: 'Lagos',
      providerPlaceId: 'google1',
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:00:00.000Z',
    }
  )
})

test('travel preference DTO returns explicit null defaults', () => {
  assert.deepEqual(toTravelPreferenceDto(null), {
    preferredVehicleId: null,
    defaultPassengers: null,
    defaultPickupInstructions: null,
    createdAt: null,
    updatedAt: null,
  })
})

test('reviews and payment resolution expose stable customer-safe enums and DTOs', () => {
  assert.equal(REVIEW_TAGS.includes('smooth_border_crossing'), true)
  assert.equal(PAYMENT_RESOLUTION_STATUSES.includes('review_required'), true)
  assert.deepEqual(
    toPaymentResolutionDto({
      id: 'resolution1',
      paymentId: 'payment1',
      bookingId: 'booking12345678',
      status: 'review_required',
      reason: 'customer_cancelled_paid_booking',
      amountNGN: 180000,
      currencyCode: 'NGN',
      provider: 'paystack',
      customerMessageCode: 'refund_review_required',
      requestedAt: null,
      reviewedAt: null,
      approvedAt: null,
      processingAt: null,
      completedAt: null,
      rejectedAt: null,
      createdAt: new Date('2026-08-17T10:00:00.000Z'),
      updatedAt: new Date('2026-08-17T10:00:00.000Z'),
    }),
    {
      id: 'resolution1',
      paymentId: 'payment1',
      bookingId: 'booking12345678',
      bookingReference: 'BFY-12345678',
      status: 'review_required',
      reason: 'customer_cancelled_paid_booking',
      amountNGN: 180000,
      currencyCode: 'NGN',
      provider: 'paystack',
      customerMessageCode: 'refund_review_required',
      requestedAt: null,
      reviewedAt: null,
      approvedAt: null,
      processingAt: null,
      completedAt: null,
      rejectedAt: null,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:00:00.000Z',
    }
  )
})

test('secure account action policies are stable', () => {
  assert.equal(accountDeleteConfirmation(), 'DELETE_MY_ACCOUNT')
  assert.deepEqual(emailChangePolicy(), {
    otpLength: 6,
    expiresInSeconds: 600,
    resendCooldownSeconds: 60,
    maxAttempts: 5,
  })
})
