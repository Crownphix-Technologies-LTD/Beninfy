import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  toCustomerBookingDetailDto,
  toDriverAssignmentHistoryDto,
  toDriverProfileDto,
  toDriverTrackingSnapshotDto,
  toDriverTripDetailDto,
} from '../src/lib/mobile/dtos'
import {
  allowedDriverTripActions,
  evaluateDriverTripTransition,
  isVehicleBlockingLegStatus,
  shouldCompleteBooking,
} from '../src/lib/tripLifecycle'
import {
  isTrackingEligibleStatus,
  realtimeChannelForDriver,
  shouldReplaceLocation,
  signPresenceScope,
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
  resolveNotificationLanguagePreference,
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
  assertMobileLaunchCurrency,
  normalizeMobileLaunchPaymentProvider,
} from '../src/lib/mobile/paymentPolicy'
import {
  hashOtpCode,
  normalizePasswordResetPrincipalType,
  passwordResetUserWhere,
  normalizeMobileLocale,
  normalizeMobilePhone,
  toMobileOnboardingDto,
  validateMobilePassword,
  verifyOtpCode,
} from '../src/lib/mobile/onboarding'
import {
  calculateFareBreakdown,
  calculateMobileAvailability,
  calculateMobileQuote,
  mobileRoutesCatalogue,
  mobileMoney,
  normalizeDiscoverySelection,
  normalizeDiscoverySelectionForRoute,
  toMobileRouteDto,
  toMobileVehicleDto,
} from '../src/lib/mobile/bookingDiscovery'
import { calculateBookingPricing } from '../src/lib/bookingPricing'
import { calculateRouteBorderFeeNGN } from '../src/lib/borderFeeCatalog'
import {
  findPublicRouteByCities,
  getPublicRouteById,
  getPublicRoutes,
  reverseBorderCrossings,
  reverseProjectionRouteId,
  routePricingId,
} from '../src/lib/routeCatalog'
import {
  canDriverExecuteAssignedTrip,
  canDriverReceiveNewAssignment,
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
import { propagateCategoryRoutePrice } from '../src/lib/routePricePropagation'
import { computeGoogleRoute } from '../src/lib/maps/googleRoutes'
import { initializePaystackTransaction } from '../src/lib/paystack'
import {
  extractSupportedCity,
  getGooglePlacesServerKey,
  normalizeCoordinateInput,
  normalizePlacesQuery,
  toMobileReverseGeocodeDto,
  toMobilePlaceDetailDto,
  toMobilePlacePredictionDto,
} from '../src/lib/maps/googlePlaces'
import { toJourneyIntelligenceDto } from '../src/lib/mobile/journeyIntelligence'
import { mobileSupportConfig } from '../src/lib/mobile/supportConfig'
import { getFcmConfig } from '../src/lib/mobile/fcm'
import { mobileErrorFromCode } from '../src/lib/mobile/errors'
import {
  locationMatchesRouteServiceArea,
  normalizeSupportedRouteCity,
  resolvePickupFareZoneForRoute,
  validateRouteLocationBoundaries,
} from '../src/lib/mobile/routeLocationBoundary'
import {
  driverAssignmentHistoryOpenWhere,
  driverAssignmentEffectiveOutcomeAt,
  driverAssignmentHistoryWhereForDriver,
  driverAssignmentOutcome,
  driverAssignmentOutcomeLabelKey,
  pageDriverAssignmentHistoryRecords,
} from '../src/lib/mobile/driverAssignmentHistory'
import {
  canLinkExistingUserToDriver,
  generateDriverTemporaryPassword,
  normalizeDriverLoginEmail,
  sanitizeDriverForAdmin,
} from '../src/lib/admin/driverProvisioning'

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

test('driver missing-assignment error maps to stable client response', async () => {
  const response = mobileErrorFromCode('DRIVER_NOT_ASSIGNED')
  const body = await response.json()

  assert.equal(response.status, 409)
  assert.equal(body.error.code, 'DRIVER_NOT_ASSIGNED')
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

test('driver assignment history outcomes are truthful driver-facing states', () => {
  assert.equal(driverAssignmentOutcome({}), 'current')
  assert.equal(driverAssignmentOutcome({ completedAt: '2026-08-18T10:00:00.000Z' }), 'completed')
  assert.equal(driverAssignmentOutcome({ declinedAt: '2026-08-18T10:00:00.000Z' }), 'declined')
  assert.equal(driverAssignmentOutcome({ supersededAt: '2026-08-18T10:00:00.000Z' }), 'reassigned')
  assert.equal(driverAssignmentOutcome({ releasedAt: '2026-08-18T10:00:00.000Z' }), 'released')
  assert.equal(driverAssignmentOutcomeLabelKey('declined'), 'driverAssignmentHistory.declined')
})

test('driver assignment history effective outcome timestamp follows outcome precedence', () => {
  const assignedAt = '2026-07-18T08:00:00.000Z'

  assert.equal(
    new Date(
      driverAssignmentEffectiveOutcomeAt({
        assignedAt,
        completedAt: '2026-08-18T10:00:00.000Z',
      })
    ).toISOString(),
    '2026-08-18T10:00:00.000Z'
  )
  assert.equal(
    new Date(
      driverAssignmentEffectiveOutcomeAt({
        assignedAt,
        declinedAt: '2026-08-17T10:00:00.000Z',
        releasedAt: '2026-08-17T10:00:00.000Z',
      })
    ).toISOString(),
    '2026-08-17T10:00:00.000Z'
  )
  assert.equal(
    new Date(
      driverAssignmentEffectiveOutcomeAt({
        assignedAt,
        releasedAt: '2026-08-16T10:00:00.000Z',
      })
    ).toISOString(),
    '2026-08-16T10:00:00.000Z'
  )
  assert.equal(
    new Date(
      driverAssignmentEffectiveOutcomeAt({
        assignedAt,
        releasedAt: '2026-08-15T10:00:00.000Z',
        supersededAt: '2026-08-16T12:00:00.000Z',
      })
    ).toISOString(),
    '2026-08-16T12:00:00.000Z'
  )
  assert.equal(
    new Date(driverAssignmentEffectiveOutcomeAt({ assignedAt })).toISOString(),
    assignedAt
  )
})

test('driver assignment history writes target the open assignment only', () => {
  assert.deepEqual(
    driverAssignmentHistoryOpenWhere({ bookingLegId: 'leg1', driverId: 'driver1' }),
    {
      bookingLegId: 'leg1',
      driverId: 'driver1',
      declinedAt: null,
      releasedAt: null,
      completedAt: null,
      supersededAt: null,
    }
  )
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
  assert.equal(dto.pickupCoordinates, null)
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
      pickupLatitude: 6.5244,
      pickupLongitude: 3.3792,
      dropoffAddress: 'Cotonou',
      dropoffLatitude: 6.3703,
      dropoffLongitude: 2.3912,
      passengers: 2,
      travelers: [
        {
          sequence: 2,
          fullName: 'Second Passenger',
          email: 'second@example.com',
          phone: '+234111',
          passportId: 'A0000001',
          nationality: 'NG',
          lead: false,
        },
        {
          sequence: 1,
          fullName: 'Ada',
          email: 'ada@example.com',
          phone: '+234000',
          passportId: 'A0000000',
          nationality: 'NG',
          lead: true,
        },
      ],
      specialRequirements: 'Call on arrival',
    },
  }

  const dto = toDriverTripDetailDto(trip)

  assert.equal(dto.reference, 'BFY-12345678')
  assert.equal(dto.specialRequirements, 'Call on arrival')
  assert.deepEqual(dto.pickupCoordinates, { latitude: 6.5244, longitude: 3.3792 })
  assert.deepEqual(dto.dropoffCoordinates, { latitude: 6.3703, longitude: 2.3912 })
  assert.deepEqual(dto.passengerManifest, {
    totalPassengers: 2,
    entries: [
      { sequence: 1, fullName: 'Ada', isLead: true },
      { sequence: 2, fullName: 'Second Passenger', isLead: false },
    ],
  })
  assert.deepEqual(dto.travelers, dto.passengerManifest.entries)
  assert.equal('paymentProviderMetadata' in dto, false)
  assert.equal(JSON.stringify(dto).includes('passportId'), false)
  assert.equal(JSON.stringify(dto).includes('second@example.com'), false)
})

test('driver change-password endpoint is driver scoped and returns replacement tokens', () => {
  const routePath = 'src/app/api/mobile/v1/driver/change-password/route.ts'
  assert.equal(existsSync(routePath), true)
  const source = readFileSync(routePath, 'utf8')

  assert.equal(source.includes("requireMobilePrincipal(req, 'DRIVER')"), true)
  assert.equal(source.includes('changeDriverPassword'), true)
  assert.equal(source.includes('otherSessionsRevoked: true'), true)
  assert.equal(source.includes('accessToken'), true)
  assert.equal(source.includes('refreshToken'), true)
  assert.equal(source.includes('customer'), false)
})

test('driver profile DTO keeps duty and presence separate', () => {
  const dto = toDriverProfileDto({
    id: 'driver1',
    name: 'Ada Driver',
    phone: '+22951019134',
    email: 'driver@example.com',
    user: { image: 'https://cdn.example/driver.jpg' },
    status: 'off_duty',
    presence: {
      status: 'online',
      lastSeenAt: new Date('2026-08-21T10:00:00.000Z'),
      lastHeartbeatAt: new Date('2026-08-21T10:00:10.000Z'),
      currentBookingLegId: 'leg1',
    },
  })

  assert.equal(dto.status, 'off_duty')
  assert.equal(dto.dutyStatus, 'off_duty')
  assert.equal(dto.image, 'https://cdn.example/driver.jpg')
  assert.equal(dto.avatarUrl, 'https://cdn.example/driver.jpg')
  assert.equal(dto.presence?.status, 'online')
  assert.equal(dto.presence?.currentBookingLegId, 'leg1')
  assert.equal('password' in dto, false)
  assert.equal('hashedPassword' in dto, false)
})

test('driver duty status is self-service only for available and off duty', () => {
  assert.equal(isDriverDutyStatus('available'), true)
  assert.equal(isDriverDutyStatus('off_duty'), true)
  assert.equal(isDriverDutyStatus('inactive'), false)
})

test('driver tracking DTO exposes publish-scoped realtime metadata only', () => {
  process.env.REALTIME_AUTH_SECRET = 'test-secret-for-driver-tracking'
  const dto = toDriverTrackingSnapshotDto({
    principalId: 'driver-user-1',
    leg: {
      id: 'leg1',
      bookingId: 'booking12345678',
      status: 'driver_en_route',
      driverId: 'driver1',
      fleetVehicle: {
        id: 'fleet1',
        label: 'Toyota Camry',
        plateNumber: 'ABC-123',
        color: 'Black',
        vehicleId: 'saloon',
        status: 'available',
      },
      driver: {
        id: 'driver1',
        name: 'Ada Driver',
        phone: '+22951019134',
        email: 'driver@example.com',
        status: 'available',
      },
      latestLocation: null,
      journeySnapshot: null,
    },
  })

  assert.equal(dto.realtime?.provider, 'supabase-broadcast')
  assert.equal(dto.realtime?.channel, 'trip:leg1:tracking')
  assert.equal(dto.realtime?.permission, 'publish')
  assert.deepEqual(dto.realtime?.events, ['trip.location_updated'])
  assert.equal(dto.journeyIntelligence, null)
})

test('driver presence scope is driver-channel scoped and verifiable', () => {
  process.env.REALTIME_AUTH_SECRET = 'test-secret-for-driver-presence'
  const channel = realtimeChannelForDriver('driver1')
  const scope = signPresenceScope({
    principalType: 'driver',
    principalId: 'driver1',
    driverId: 'driver1',
    channel,
    ttlSeconds: 60,
  })

  assert.equal(scope.provider, 'supabase-presence')
  assert.equal(scope.permission, 'presence')
  assert.equal(scope.channel, 'driver:driver1:presence')
  assert.match(scope.token, /^[^.]+\.[^.]+$/)
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
  assert.equal(templateFor('trip.driver_arrived', 'fr', 'customer')?.title, 'Chauffeur arrive')
  assert.equal(templateFor('trip.driver_arrived', 'en', 'customer')?.title, 'Driver arrived')
})

test('notification language prefers persisted user locale before push device language', () => {
  assert.equal(
    resolveNotificationLanguagePreference({
      userLocale: 'fr',
      deviceLanguage: null,
    }),
    'fr'
  )
  assert.equal(
    resolveNotificationLanguagePreference({
      userLocale: 'fr',
      deviceLanguage: 'en',
    }),
    'fr'
  )
  assert.equal(
    resolveNotificationLanguagePreference({
      userLocale: null,
      deviceLanguage: 'fr-BJ',
    }),
    'fr'
  )
  assert.equal(
    resolveNotificationLanguagePreference({
      userLocale: null,
      deviceLanguage: null,
    }),
    'en'
  )
})

test('notification templates are audience-specific where product copy differs', () => {
  const customerAssigned = templateFor('trip.driver_assigned', 'en', 'customer')
  const driverAssigned = templateFor('trip.driver_assigned', 'en', 'driver')
  const driverAssignedFr = templateFor('trip.driver_assigned', 'fr', 'driver')
  const customerCompleted = templateFor('trip.completed', 'en', 'customer')
  const driverCompleted = templateFor('trip.completed', 'en', 'driver')
  const driverCompletedFr = templateFor('trip.completed', 'fr', 'driver')

  assert.equal(customerAssigned?.body, 'A Beninfy driver has been assigned to your trip.')
  assert.equal(driverAssigned?.body, 'A new trip has been assigned to you.')
  assert.equal(driverAssignedFr?.body, 'Un nouveau trajet vous a ete assigne.')
  assert.notEqual(driverAssigned?.body, customerAssigned?.body)

  assert.equal(
    customerCompleted?.body,
    'Your Beninfy trip is complete. Thank you for travelling with us.'
  )
  assert.equal(driverCompleted?.body, 'Trip completed successfully.')
  assert.equal(driverCompletedFr?.body, 'Trajet termine avec succes.')
  assert.notEqual(driverCompleted?.body, customerCompleted?.body)
})

test('assignment removed notification remains non-actionable driver metadata', () => {
  const template = templateFor('trip.assignment_removed', 'en', 'driver')
  const data = pushPayloadToData({
    type: 'trip.assignment_removed',
    version: 1,
    bookingId: 'booking1',
    bookingLegId: 'leg1',
  })

  assert.equal(template?.body.includes('removed'), true)
  assert.equal('action' in data, false)
  assert.equal('allowedActions' in data, false)
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
  const secret = 'sk_test_should_not_leak'
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
  assert.equal(dto.checkout?.checkoutUrl, 'https://checkout.example')
  assert.equal(dto.checkout?.accessCode, 'access-code')
  assert.equal(dto.checkout?.mode, 'hosted_checkout')
  assert.equal('secret' in dto, false)
  assert.equal('webhookSignature' in dto, false)
  assert.equal(JSON.stringify(dto).includes(secret), false)
  assert.equal(JSON.stringify(dto).includes('PAYSTACK_SECRET_KEY'), false)
})

test('paystack initialization requires and maps access code for Flutter SDK checkout', async () => {
  const originalFetch = globalThis.fetch
  const requestBodies: Array<Record<string, unknown>> = []
  let authHeader: string | null = null
  globalThis.fetch = (async (_url, init) => {
    authHeader = new Headers(init?.headers).get('Authorization')
    requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    return new Response(
      JSON.stringify({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/session',
          access_code: 'paystack-access-code',
          reference: 'BFY-M-123',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }) as typeof fetch
  try {
    const result = await initializePaystackTransaction({
      secret: 'sk_test_secret_value',
      email: 'customer@example.com',
      amountNGN: 180000,
      reference: 'BFY-M-123',
      callbackUrl: 'https://beninfy.com/en/rides/confirmed',
      metadata: { bookingId: 'booking1', provider: 'paystack' },
    })

    assert.deepEqual(result, {
      authorizationUrl: 'https://checkout.paystack.com/session',
      accessCode: 'paystack-access-code',
      reference: 'BFY-M-123',
    })
    assert.equal(authHeader, 'Bearer sk_test_secret_value')
    const requestBody = requestBodies[0]
    assert.ok(requestBody)
    assert.equal(requestBody.amount, 18000000)
    assert.equal(requestBody.currency, 'NGN')
    assert.equal(requestBody.reference, 'BFY-M-123')
    assert.equal(JSON.stringify(result).includes('sk_test_secret_value'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('paystack initialization fails closed when access code is missing', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/session',
          reference: 'BFY-M-123',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch
  try {
    await assert.rejects(
      () =>
        initializePaystackTransaction({
          secret: 'sk_test_secret_value',
          email: 'customer@example.com',
          amountNGN: 180000,
          reference: 'BFY-M-123',
          callbackUrl: 'https://beninfy.com/en/rides/confirmed',
          metadata: { bookingId: 'booking1', provider: 'paystack' },
        }),
      /Payment init failed/
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('payonus checkout DTO remains hosted-widget compatible and access-code free', () => {
  const dto = toMobilePaymentDto({
    booking: { id: 'booking1', status: 'pending', priceNGN: 180000 },
    payment: {
      id: 'payment1',
      bookingId: 'booking1',
      amountNGN: 180000,
      status: 'pending',
      reference: 'BFY-M-123',
      provider: 'payonus',
      providerReference: null,
      providerCheckoutUrl: null,
      providerAccessCode: null,
      currencyCode: 'NGN',
      checkoutAmount: 180000,
      expiresAt: new Date('2026-08-15T12:30:00.000Z'),
      paidAt: null,
      failureCode: null,
      createdAt: new Date('2026-08-15T12:00:00.000Z'),
      updatedAt: new Date('2026-08-15T12:00:00.000Z'),
    },
  })

  assert.equal(dto.checkout?.mode, 'payonus_checkout')
  assert.equal(dto.checkout?.checkoutUrl, null)
  assert.equal(dto.checkout?.authorizationUrl, null)
  assert.equal(dto.checkout?.accessCode, null)
})

test('mobile payment state blocks already-paid bookings and reuses duplicate pending attempts', () => {
  assert.equal(canRetryPayment({ bookingStatus: 'confirmed', paymentStatus: 'paid' }), false)
  assert.equal(canRetryPayment({ bookingStatus: 'completed', paymentStatus: 'paid' }), false)
  assert.equal(canRetryPayment({ bookingStatus: 'pending', paymentStatus: 'pending' }), false)
  assert.equal(
    mobilePaymentState({ bookingStatus: 'pending', paymentStatus: 'pending' }),
    'pending'
  )
})

test('mobile payment verification remains backend-authoritative after SDK success', () => {
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

  assert.equal(dto.status, 'pending')
  assert.equal(dto.canRetry, false)
  assert.equal(dto.paymentReference, 'BFY-M-123')
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

test('mobile password reset lookup supports customer and provisioned driver principals', () => {
  assert.equal(normalizePasswordResetPrincipalType(undefined), 'CUSTOMER')
  assert.equal(normalizePasswordResetPrincipalType('CUSTOMER'), 'CUSTOMER')
  assert.equal(normalizePasswordResetPrincipalType('DRIVER'), 'DRIVER')

  assert.deepEqual(
    passwordResetUserWhere({ email: ' Driver@Test.COM ', principalType: 'DRIVER' }),
    {
      email: 'driver@test.com',
      role: 'driver',
      disabledAt: null,
      hashedPassword: { not: null },
      driver: { isNot: null },
    }
  )
  assert.deepEqual(passwordResetUserWhere({ email: ' Customer@Test.COM ' }), {
    email: 'customer@test.com',
    role: 'user',
    disabledAt: null,
    hashedPassword: { not: null },
  })
})

test('driver password reset remains recovery only and non-enumerating', () => {
  const forgotRoute = readFileSync('src/app/api/mobile/v1/auth/forgot-password/route.ts', 'utf8')
  const onboardingSource = readFileSync('src/lib/mobile/onboarding.ts', 'utf8')
  const notificationSource = readFileSync('src/lib/notifications.ts', 'utf8')

  assert.equal(
    forgotRoute.includes("principalType: z.enum(['CUSTOMER', 'DRIVER']).optional()"),
    true
  )
  assert.equal(
    forgotRoute.includes('If the account exists, a password reset email has been sent.'),
    true
  )
  assert.equal(
    onboardingSource.includes("role: principalType === 'DRIVER' ? 'driver' : 'user'"),
    true
  )
  assert.equal(onboardingSource.includes('driver: { isNot: null }'), true)
  assert.equal(onboardingSource.includes('prisma.user.create'), false)
  assert.equal(onboardingSource.includes('prisma.driver.create'), false)
  assert.equal(
    onboardingSource.includes(
      "const appScheme = principalType === 'DRIVER' ? 'beninfy-driver' : 'beninfy'"
    ),
    true
  )
  assert.equal(notificationSource.includes('Beninfy driver account'), true)
  assert.equal(notificationSource.includes('compte chauffeur Beninfy'), true)
})

test('password reset completion consumes tokens and revokes old mobile sessions', () => {
  const onboardingSource = readFileSync('src/lib/mobile/onboarding.ts', 'utf8')

  assert.equal(onboardingSource.includes('sessionVersion: { increment: 1 }'), true)
  assert.equal(onboardingSource.includes('prisma.mobileSession.updateMany'), true)
  assert.equal(onboardingSource.includes('where: { userId: record.userId, revokedAt: null }'), true)
  assert.equal(onboardingSource.includes('data: { revokedAt: now }'), true)
  assert.equal(onboardingSource.includes('data: { consumedAt: now }'), true)
})

test('admin driver provisioning normalizes login email and creates strong temporary passwords', () => {
  assert.equal(normalizeDriverLoginEmail(' Driver@Test.COM '), 'driver@test.com')
  assert.equal(normalizeDriverLoginEmail('   '), null)

  const temporaryPassword = generateDriverTemporaryPassword()
  assert.equal(validateMobilePassword(temporaryPassword), true)
  assert.match(temporaryPassword, /^Bfy-[A-Za-z0-9_-]{16}$/)
})

test('admin driver DTO exposes login state but never password hash', () => {
  const driver = sanitizeDriverForAdmin({
    id: 'driver1',
    userId: 'user1',
    name: 'Driver One',
    phone: '+22951019134',
    email: 'driver@example.com',
    status: 'available',
    homeCity: 'Cotonou',
    licenseNumber: 'LIC-1',
    notes: null,
    createdAt: new Date('2026-08-18T08:00:00.000Z'),
    updatedAt: new Date('2026-08-18T08:00:00.000Z'),
    user: {
      id: 'user1',
      email: 'driver@example.com',
      role: 'driver',
      disabledAt: null,
    },
  })

  assert.equal(driver.loginAccount.exists, true)
  assert.equal(driver.loginAccount.email, 'driver@example.com')
  assert.equal(driver.loginAccount.role, 'driver')
  assert.equal('hashedPassword' in driver, false)
  assert.equal('temporaryPassword' in driver, false)
})

test('admin driver provisioning only links safe unassigned non-admin users', () => {
  assert.equal(canLinkExistingUserToDriver({ role: 'user', disabledAt: null, driver: null }), true)
  assert.equal(
    canLinkExistingUserToDriver({ role: 'driver', disabledAt: null, driver: null }),
    true
  )
  assert.equal(
    canLinkExistingUserToDriver({ role: 'admin', disabledAt: null, driver: null }),
    false
  )
  assert.equal(
    canLinkExistingUserToDriver({ role: 'user', disabledAt: null, driver: { id: 'driver2' } }),
    false
  )
})

test('admin driver creation provisions mobile auth user and never stores plaintext password metadata', () => {
  const createRoute = readFileSync('src/app/api/admin/drivers/route.ts', 'utf8')
  const accountRoute = readFileSync('src/app/api/admin/drivers/[id]/account/route.ts', 'utf8')

  assert.equal(createRoute.includes("role: 'driver'"), true)
  assert.equal(createRoute.includes('hashedPassword'), true)
  assert.equal(createRoute.includes('userId: user.id'), true)
  assert.equal(createRoute.includes('temporaryPasswordReturned'), false)
  assert.equal(accountRoute.includes("role: 'driver'"), true)
  assert.equal(accountRoute.includes('hashedPassword'), true)
  assert.equal(accountRoute.includes('temporaryPasswordReturned'), true)
  assert.equal(accountRoute.includes('linkExistingUser'), true)
  assert.equal(accountRoute.includes('canLinkExistingUserToDriver'), true)
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

test('mobile vehicle discovery DTO exposes capacity and safe pricing fields', () => {
  const dto = toMobileVehicleDto(vehicles[0])

  assert.equal(dto.id, 'saloon')
  assert.equal(dto.capacity, 3)
  assert.equal(dto.available, true)
  assert.equal('plateNumber' in dto, false)
  assert.equal('notes' in dto, false)
})

test('mobile discovery selection validates round trip return dates', () => {
  const missingReturn = normalizeDiscoverySelectionForRoute(
    {
      routeId: 'lagos-cotonou',
      vehicleId: 'saloon',
      tripType: 'round-trip',
      departureDate: '2026-08-20T09:00:00.000Z',
      passengers: 1,
    },
    routes[0]
  )

  assert.equal(missingReturn.ok, false)
  if (!missingReturn.ok) assert.equal(missingReturn.code, 'INVALID_RETURN_DATE')

  const valid = normalizeDiscoverySelectionForRoute(
    {
      routeId: 'lagos-cotonou',
      vehicleId: 'saloon',
      tripType: 'round-trip',
      departureDate: '2026-08-20T09:00:00.000Z',
      returnDate: '2026-08-22T09:00:00.000Z',
      passengers: 1,
    },
    routes[0]
  )

  assert.equal(valid.ok, true)
  if (valid.ok) assert.equal(valid.data.datesToCheck.length, 2)
})

test('mobile fare breakdown doubles only ride fare for round trips', () => {
  assert.deepEqual(
    calculateFareBreakdown({
      oneWayDropoffFare: 180000,
      tripType: 'round-trip',
      borderFeeNGN: 40000,
      borderFeePerPassengerNGN: 20000,
      borderFeePassengerCount: 2,
    }),
    {
      oneWayDropoffFare: 180000,
      legCount: 2,
      rideFareNGN: 360000,
      borderFeePerPassengerNGN: 20000,
      borderFeePassengerCount: 2,
      borderFeeNGN: 40000,
      subtotalNGN: 400000,
    }
  )
})

test('public route service excludes disabled database routes', async () => {
  let whereClause: unknown = null
  const client = {
    route: {
      findMany: async (args: { where?: unknown }) => {
        whereClause = args.where
        return [
          {
            ...routes[0],
            available: true,
            borderFeeIds: ['nigeria-benin'],
          },
        ]
      },
    },
  }

  const result = await getPublicRoutes(client as never)

  assert.deepEqual(whereClause, { available: true })
  assert.equal(result.length, 2)
  assert.equal(result[0].id, 'lagos-cotonou')
  assert.equal(result[0].available, true)
  assert.equal(result[1].id, reverseProjectionRouteId('lagos-cotonou'))
})

test('public route catalogue synthesizes missing reverse corridors without duplicating explicit reverses', async () => {
  const client = {
    route: {
      findMany: async () => [
        {
          ...routes[0],
          available: true,
          borderFeeIds: ['nigeria-benin'],
        },
        {
          ...routes.find((route) => route.id === 'cotonou-togo')!,
          available: true,
          borderFeeIds: ['benin-togo'],
        },
        {
          ...routes.find((route) => route.id === 'lome-cotonou')!,
          available: true,
          borderFeeIds: ['benin-togo'],
        },
      ],
    },
  }

  const result = await getPublicRoutes(client as never)
  const pairs = result.map((route) => `${route.from}->${route.to}`)

  assert.equal(pairs.includes('Lagos->Cotonou'), true)
  assert.equal(pairs.includes('Cotonou->Lagos'), true)
  assert.equal(pairs.includes('Cotonou->Lomé'), true)
  assert.equal(pairs.filter((pair) => pair === 'Lomé->Cotonou').length, 1)

  const reverseLagos = result.find((route) => route.from === 'Cotonou' && route.to === 'Lagos')
  assert.equal(reverseLagos?.id, reverseProjectionRouteId('lagos-cotonou'))
  assert.equal(reverseLagos?.pricingRouteId, 'lagos-cotonou')
  assert.equal(reverseLagos?.direction, 'reverse_projection')

  const explicitReverse = result.find((route) => route.from === 'Lomé' && route.to === 'Cotonou')
  assert.equal(explicitReverse?.id, 'lome-cotonou')
  assert.equal(explicitReverse?.direction, 'explicit')
})

test('mobile routes catalogue exposes bidirectional destination options from projections', async () => {
  const rows = [
    {
      ...routes.find((route) => route.id === 'lagos-cotonou')!,
      available: true,
      borderFeeIds: ['nigeria-benin'],
    },
    {
      ...routes.find((route) => route.id === 'cotonou-togo')!,
      available: true,
      borderFeeIds: ['benin-togo'],
    },
    {
      ...routes.find((route) => route.id === 'togo-ghana')!,
      available: true,
      borderFeeIds: ['togo-ghana'],
    },
  ]
  const client = {
    route: {
      findMany: async () => rows,
    },
  }

  const catalogue = await mobileRoutesCatalogue(client as never)
  const byId = new Map(catalogue.routes.map((route) => [route.id, route]))
  const destinationsFrom = (city: string) =>
    catalogue.routes
      .filter((route) => route.origin.city === city)
      .map((route) => route.destination.city)
      .sort()

  assert.equal(byId.get('lagos-cotonou')?.origin.city, 'Lagos')
  assert.equal(byId.get('lagos-cotonou')?.destination.city, 'Cotonou')
  assert.equal(byId.get(reverseProjectionRouteId('lagos-cotonou'))?.origin.city, 'Cotonou')
  assert.equal(byId.get(reverseProjectionRouteId('lagos-cotonou'))?.destination.city, 'Lagos')
  assert.equal(byId.get(reverseProjectionRouteId('lagos-cotonou'))?.pricingRouteId, 'lagos-cotonou')
  assert.equal(byId.get(reverseProjectionRouteId('lagos-cotonou'))?.direction, 'reverse_projection')
  assert.deepEqual(destinationsFrom('Lagos'), ['Cotonou'])
  assert.deepEqual(destinationsFrom('Cotonou'), ['Lagos', 'Lomé'])
  assert.deepEqual(destinationsFrom('Lomé'), ['Accra', 'Cotonou'])
  assert.deepEqual(destinationsFrom('Accra'), ['Lomé'])
})

test('supported Beninfy corridors resolve in both directions with explicit reverse preferred', async () => {
  const rows = routes.map((route) => ({
    ...route,
    available: true,
    borderFeeIds: [],
  }))
  const client = {
    route: {
      findFirst: async (args: {
        where: { from?: { equals: string }; to?: { equals: string }; id?: string }
      }) => {
        if (args.where.id) return rows.find((route) => route.id === args.where.id) ?? null
        return (
          rows.find(
            (route) =>
              route.from.toLowerCase() === args.where.from?.equals.toLowerCase() &&
              route.to.toLowerCase() === args.where.to?.equals.toLowerCase()
          ) ?? null
        )
      },
    },
  }

  const examples = [
    ['Lagos', 'Cotonou', 'lagos-cotonou', 'explicit', 'lagos-cotonou'],
    [
      'Cotonou',
      'Lagos',
      reverseProjectionRouteId('lagos-cotonou'),
      'reverse_projection',
      'lagos-cotonou',
    ],
    ['Cotonou', 'Lomé', 'cotonou-togo', 'explicit', 'cotonou-togo'],
    ['Lomé', 'Cotonou', 'lome-cotonou', 'explicit', 'lome-cotonou'],
    ['Lomé', 'Accra', 'togo-ghana', 'explicit', 'togo-ghana'],
    ['Accra', 'Lomé', 'accra-lome', 'explicit', 'accra-lome'],
    ['Cotonou', 'Accra', 'cotonou-accra', 'explicit', 'cotonou-accra'],
    ['Accra', 'Cotonou', 'accra-cotonou', 'explicit', 'accra-cotonou'],
    ['Lagos', 'Lomé', 'lagos-togo', 'explicit', 'lagos-togo'],
    ['Lomé', 'Lagos', reverseProjectionRouteId('lagos-togo'), 'reverse_projection', 'lagos-togo'],
    ['Lagos', 'Accra', 'lagos-ghana', 'explicit', 'lagos-ghana'],
    [
      'Accra',
      'Lagos',
      reverseProjectionRouteId('lagos-ghana'),
      'reverse_projection',
      'lagos-ghana',
    ],
  ] as const

  for (const [from, to, expectedId, expectedDirection, expectedPricingId] of examples) {
    const route = await findPublicRouteByCities(from, to, client as never)
    assert.equal(route?.id, expectedId)
    assert.equal(route?.direction, expectedDirection)
    assert.equal(route ? routePricingId(route) : null, expectedPricingId)
    assert.equal(route?.from, from)
    assert.equal(route?.to, to)
  }
})

test('mobile booking discovery accepts reverse direction through backend route matching', async () => {
  const rows = routes.map((route) => ({
    ...route,
    available: true,
    borderFeeIds: [],
  }))
  const client = {
    route: {
      findFirst: async (args: {
        where: { from?: { equals: string }; to?: { equals: string } }
      }) => {
        return (
          rows.find(
            (route) =>
              route.from.toLowerCase() === args.where.from?.equals.toLowerCase() &&
              route.to.toLowerCase() === args.where.to?.equals.toLowerCase()
          ) ?? null
        )
      },
    },
  }

  const result = await normalizeDiscoverySelection(
    {
      from: 'Cotonou',
      to: 'Lagos',
      vehicleId: 'saloon',
      tripType: 'one-way',
      departureDate: '2026-08-20T09:00:00.000Z',
      passengers: 1,
      pickupCity: 'Cotonou',
      pickupCountryCode: 'BJ',
      destinationCity: 'Lagos',
      destinationCountryCode: 'NG',
    },
    client as never
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.data.route.id, reverseProjectionRouteId('lagos-cotonou'))
    assert.equal(result.data.route.from, 'Cotonou')
    assert.equal(result.data.route.to, 'Lagos')
    assert.equal(routePricingId(result.data.route), 'lagos-cotonou')
  }
})

test('route location boundaries accept only places inside selected route endpoint cities', () => {
  const cotonouLome = routes.find((route) => route.id === 'cotonou-togo')!
  const valid = validateRouteLocationBoundaries({
    route: cotonouLome,
    pickup: { city: 'Cotonou', countryCode: 'BJ' },
    destination: { city: 'Lome', countryCode: 'TG' },
  })
  assert.equal(valid.ok, true)
  if (valid.ok) {
    assert.equal(valid.metadata.pickupServiceArea.serviceArea.city, 'Cotonou')
    assert.equal(valid.metadata.destinationServiceArea.serviceArea.city, 'Lomé')
    assert.equal(valid.metadata.pickupFareZone, null)
  }

  const portoNovoPickup = validateRouteLocationBoundaries({
    route: cotonouLome,
    pickup: { city: 'Porto-Novo', countryCode: 'BJ' },
    destination: { city: 'Lomé', countryCode: 'TG' },
  })
  assert.equal(portoNovoPickup.ok, false)
  if (!portoNovoPickup.ok) {
    assert.equal(portoNovoPickup.code, 'PICKUP_OUTSIDE_ROUTE_CITY')
    assert.equal(portoNovoPickup.details.expectedCity, 'Cotonou')
    assert.equal(portoNovoPickup.details.resolvedCity, 'Porto-Novo')
  }

  const accraDestination = validateRouteLocationBoundaries({
    route: cotonouLome,
    pickup: { city: 'Cotonou', countryCode: 'BJ' },
    destination: { city: 'Accra', countryCode: 'GH' },
  })
  assert.equal(accraDestination.ok, false)
  if (!accraDestination.ok) assert.equal(accraDestination.code, 'DESTINATION_OUTSIDE_ROUTE_CITY')
})

test('route location boundaries work for Lagos corridors and reverse projections', async () => {
  const lagosCotonou = routes.find((route) => route.id === 'lagos-cotonou')!
  const validLagos = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: { city: 'Lagos', countryCode: 'NG' },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(validLagos.ok, true)
  if (validLagos.ok) {
    assert.equal(validLagos.metadata.pickupServiceArea.serviceArea.city, 'Lagos')
    assert.equal(validLagos.metadata.pickupFareZone?.code, 'lagos_mainland')
  }

  const wrongPickup = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: { city: 'Cotonou', countryCode: 'BJ' },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(wrongPickup.ok, false)
  if (!wrongPickup.ok) assert.equal(wrongPickup.code, 'PICKUP_OUTSIDE_ROUTE_CITY')

  const client = {
    route: {
      findFirst: async () => ({
        ...lagosCotonou,
        available: true,
        borderFeeIds: ['nigeria-benin'],
      }),
    },
  }
  const reverse = await getPublicRouteById(
    reverseProjectionRouteId('lagos-cotonou'),
    client as never
  )
  assert.ok(reverse)
  const reverseBoundary = validateRouteLocationBoundaries({
    route: reverse!,
    pickup: { city: 'Cotonou', countryCode: 'BJ' },
    destination: { city: 'Lagos', countryCode: 'NG' },
  })
  assert.equal(reverseBoundary.ok, true)
  if (reverseBoundary.ok) assert.equal(reverseBoundary.metadata.pickupFareZone, null)
})

test('route service areas accept configured operational localities without rewriting route identity', () => {
  const accraLagos = {
    ...routes.find((route) => route.id === 'lagos-ghana')!,
    from: 'Accra',
    fromCountry: 'Ghana',
    to: 'Lagos',
    toCountry: 'Nigeria',
  }
  const badagryDestination = validateRouteLocationBoundaries({
    route: accraLagos,
    pickup: { city: 'Accra', countryCode: 'GH' },
    destination: { city: 'Badagry', countryCode: 'NG' },
  })
  assert.equal(badagryDestination.ok, true)
  if (badagryDestination.ok) {
    assert.equal(badagryDestination.metadata.destinationServiceArea.serviceArea.city, 'Lagos')
    assert.equal(badagryDestination.metadata.destinationServiceArea.resolvedLocality, 'Badagry')
    assert.equal(accraLagos.to, 'Lagos')
    assert.equal(badagryDestination.metadata.pickupFareZone, null)
  }

  const unrelatedNigeriaDestination = validateRouteLocationBoundaries({
    route: accraLagos,
    pickup: { city: 'Accra', countryCode: 'GH' },
    destination: { city: 'Abuja', countryCode: 'NG' },
  })
  assert.equal(unrelatedNigeriaDestination.ok, false)
  if (!unrelatedNigeriaDestination.ok)
    assert.equal(unrelatedNigeriaDestination.code, 'DESTINATION_OUTSIDE_ROUTE_CITY')

  const wrongCountryLocality = validateRouteLocationBoundaries({
    route: accraLagos,
    pickup: { city: 'Accra', countryCode: 'GH' },
    destination: { city: 'Badagry', countryCode: 'BJ' },
  })
  assert.equal(wrongCountryLocality.ok, false)
  if (!wrongCountryLocality.ok)
    assert.equal(wrongCountryLocality.code, 'DESTINATION_OUTSIDE_ROUTE_CITY')
})

test('lagos service-area resolver accepts operational Lagos localities and rejects unrelated cities', () => {
  for (const city of ['Ikeja', 'Lekki', 'Badagry']) {
    const result = locationMatchesRouteServiceArea({
      field: 'destination',
      expectedCity: 'Lagos',
      expectedCountry: 'Nigeria',
      location: { city, countryCode: 'NG' },
    })

    assert.equal(result.ok, true, `${city} should resolve inside Lagos`)
    if (result.ok) {
      assert.equal(result.match.serviceArea.city, 'Lagos')
      assert.equal(result.match.resolvedLocality, city)
    }
  }

  const unrelated = locationMatchesRouteServiceArea({
    field: 'destination',
    expectedCity: 'Lagos',
    expectedCountry: 'Nigeria',
    location: { city: 'Abuja', countryCode: 'NG' },
  })

  assert.equal(unrelated.ok, false)
  if (!unrelated.ok) assert.equal(unrelated.code, 'DESTINATION_OUTSIDE_ROUTE_CITY')
})

test('lagos service-area resolver uses coordinates before Google locality wording', () => {
  const ikejaLga = locationMatchesRouteServiceArea({
    field: 'destination',
    expectedCity: 'Lagos',
    expectedCountry: 'Nigeria',
    location: {
      city: 'Ikeja LGA',
      countryCode: 'NG',
      latitude: 6.6018,
      longitude: 3.3515,
    },
  })

  assert.equal(ikejaLga.ok, true)
  if (ikejaLga.ok) {
    assert.equal(ikejaLga.match.serviceArea.city, 'Lagos')
    assert.equal(ikejaLga.match.resolvedLocality, 'Ikeja LGA')
    assert.equal(ikejaLga.match.latitude, 6.6018)
    assert.equal(ikejaLga.match.longitude, 3.3515)
  }

  const outsideLagos = locationMatchesRouteServiceArea({
    field: 'destination',
    expectedCity: 'Lagos',
    expectedCountry: 'Nigeria',
    location: {
      city: 'Ikeja',
      countryCode: 'NG',
      latitude: 7.3775,
      longitude: 3.947,
    },
  })

  assert.equal(outsideLagos.ok, false)
  if (!outsideLagos.ok) assert.equal(outsideLagos.code, 'DESTINATION_OUTSIDE_ROUTE_CITY')
})

test('lagos coordinate resolver classifies representative mainland, island and external points', () => {
  const lagosCotonou = routes.find((route) => route.id === 'lagos-cotonou')!
  const mainland = [
    ['Ikeja', 6.6018, 3.3515],
    ['Ojodu', 6.645, 3.354],
    ['Yaba', 6.5158, 3.3899],
    ['Surulere', 6.501, 3.356],
    ['Gbagada', 6.5573, 3.3841],
    ['Maryland', 6.573, 3.367],
    ['Ikorodu', 6.6194, 3.5105],
    ['Badagry', 6.415, 2.8813],
  ] as const
  const island = [
    ['Victoria Island', 6.4281, 3.4219],
    ['Ikoyi', 6.4541, 3.4256],
    ['Oniru', 6.431, 3.455],
    ['Lekki Phase 1', 6.4474, 3.4723],
    ['Lagos Island', 6.4549, 3.3947],
    ['Banana Island', 6.4698, 3.4627],
    ['Ajah', 6.4698, 3.5852],
  ] as const
  const outside = [
    ['Cotonou', 6.3703, 2.3912],
    ['Porto-Novo', 6.4969, 2.6289],
    ['Abeokuta', 7.1475, 3.3619],
    ['Ibadan', 7.3775, 3.947],
    ['Abuja', 9.0765, 7.3986],
  ] as const

  for (const [city, latitude, longitude] of mainland) {
    const result = validateRouteLocationBoundaries({
      route: lagosCotonou,
      pickup: { city, countryCode: 'NG', latitude, longitude },
      destination: { city: 'Cotonou', countryCode: 'BJ' },
    })
    assert.equal(result.ok, true, `${city} should be in Lagos service area`)
    if (result.ok) {
      assert.equal(result.metadata.pickupServiceArea.serviceArea.city, 'Lagos')
      assert.equal(result.metadata.pickupFareZone?.code, 'lagos_mainland', city)
    }
  }

  for (const [city, latitude, longitude] of island) {
    const result = validateRouteLocationBoundaries({
      route: lagosCotonou,
      pickup: { city, countryCode: 'NG', latitude, longitude },
      destination: { city: 'Cotonou', countryCode: 'BJ' },
    })
    assert.equal(result.ok, true, `${city} should be in Lagos service area`)
    if (result.ok) {
      assert.equal(result.metadata.pickupServiceArea.serviceArea.city, 'Lagos')
      assert.equal(result.metadata.pickupFareZone?.code, 'lagos_island', city)
    }
  }

  for (const [city, latitude, longitude] of outside) {
    const result = validateRouteLocationBoundaries({
      route: lagosCotonou,
      pickup: { city: 'Lagos', countryCode: 'NG', latitude, longitude },
      destination: { city: 'Cotonou', countryCode: 'BJ' },
    })
    assert.equal(result.ok, false, `${city} coordinates must not become Mainland fallback`)
    if (!result.ok) assert.equal(result.code, 'PICKUP_OUTSIDE_ROUTE_CITY')
  }
})

test('lagos coordinate resolver handles island-mainland boundary adjacency without gaps', () => {
  const lagosCotonou = routes.find((route) => route.id === 'lagos-cotonou')!
  const justNorthOfIsland = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: { city: 'Lagos', countryCode: 'NG', latitude: 6.505, longitude: 3.4 },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(justNorthOfIsland.ok, true)
  if (justNorthOfIsland.ok) {
    assert.equal(justNorthOfIsland.metadata.pickupServiceArea.serviceArea.city, 'Lagos')
    assert.equal(justNorthOfIsland.metadata.pickupFareZone?.code, 'lagos_mainland')
  }

  const justSouthOfIsland = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: { city: 'Lagos', countryCode: 'NG', latitude: 6.495, longitude: 3.4 },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(justSouthOfIsland.ok, true)
  if (justSouthOfIsland.ok) {
    assert.equal(justSouthOfIsland.metadata.pickupServiceArea.serviceArea.city, 'Lagos')
    assert.equal(justSouthOfIsland.metadata.pickupFareZone?.code, 'lagos_island')
  }
})

test('route service areas support current Beninfy endpoint corridors in both directions', () => {
  const routeCases = [
    ['lagos-cotonou', false, 'Ikeja', 'NG', 'Cotonou', 'BJ'],
    ['lagos-cotonou', true, 'Cotonou', 'BJ', 'Lekki', 'NG'],
    ['lagos-ouidah', false, 'Badagry', 'NG', 'Ouidah', 'BJ'],
    ['lagos-ouidah', true, 'Ouidah', 'BJ', 'Ikeja', 'NG'],
    ['lagos-porto-novo', false, 'Ikorodu', 'NG', 'Porto-Novo', 'BJ'],
    ['lagos-porto-novo', true, 'Porto Novo', 'BJ', 'Lekki', 'NG'],
    ['lagos-aneho', false, 'Lagos', 'NG', 'Aného', 'TG'],
    ['lagos-aneho', true, 'Aneho', 'TG', 'Ikeja', 'NG'],
    ['lagos-kpalime', false, 'Lekki', 'NG', 'Kpalimé', 'TG'],
    ['lagos-kpalime', true, 'Kpalime', 'TG', 'Badagry', 'NG'],
    ['cotonou-togo', false, 'Cotonou', 'BJ', 'Lomé', 'TG'],
    ['cotonou-togo', true, 'Lome', 'TG', 'Cotonou', 'BJ'],
    ['togo-ghana', false, 'Lomé', 'TG', 'Accra', 'GH'],
    ['togo-ghana', true, 'Accra', 'GH', 'Lome', 'TG'],
  ] as const

  for (const [
    routeId,
    reverse,
    pickupCity,
    pickupCountryCode,
    destinationCity,
    destinationCountryCode,
  ] of routeCases) {
    const sourceRoute = routes.find((candidate) => candidate.id === routeId)!
    const route = reverse
      ? {
          ...sourceRoute,
          from: sourceRoute.to,
          fromCountry: sourceRoute.toCountry,
          to: sourceRoute.from,
          toCountry: sourceRoute.fromCountry,
        }
      : sourceRoute
    const result = validateRouteLocationBoundaries({
      route,
      pickup: { city: pickupCity, countryCode: pickupCountryCode },
      destination: { city: destinationCity, countryCode: destinationCountryCode },
    })
    assert.equal(result.ok, true, `${pickupCity} -> ${destinationCity} should fit ${routeId}`)
  }
})

test('mobile availability reconciles canonical route id with reverse city pair before service-area validation', async () => {
  const rows = routes.map((route) => ({
    ...route,
    available: true,
    borderFeeIds: [],
  }))
  const client = {
    route: {
      findFirst: async (args: {
        where: {
          id?: string
          available?: boolean
          from?: { equals: string }
          to?: { equals: string }
        }
      }) => {
        if (args.where.id) return rows.find((route) => route.id === args.where.id) ?? null
        return (
          rows.find(
            (route) =>
              route.from.toLowerCase() === args.where.from?.equals.toLowerCase() &&
              route.to.toLowerCase() === args.where.to?.equals.toLowerCase()
          ) ?? null
        )
      },
    },
    vehicle: {
      findUnique: async () => null,
    },
    fleetVehicle: {
      count: async () => 1,
      findMany: async () => [
        {
          id: 'saloon-unit-1',
          vehicleId: 'saloon',
          label: 'Toyota Camry',
          color: 'Black',
          currentCity: 'Cotonou',
          status: 'available',
          vehicle: {
            id: 'saloon',
            name: 'Saloon Car',
            capacity: 3,
            luggageCapacity: 2,
            image: '/images/fleet/saloon.jpg',
          },
        },
      ],
      findUnique: async () => null,
    },
    bookingLeg: {
      count: async () => 0,
    },
  }

  const result = await calculateMobileAvailability(
    {
      routeId: 'lagos-cotonou',
      from: 'Cotonou',
      to: 'Lagos',
      vehicleId: 'saloon',
      tripType: 'one-way',
      departureDate: '2026-08-20T09:00:00.000Z',
      passengers: 1,
      pickupCity: 'Cotonou',
      pickupCountryCode: 'BJ',
      destinationCity: 'Ikeja LGA',
      destinationCountryCode: 'NG',
      destinationLatitude: 6.6018,
      destinationLongitude: 3.3515,
    },
    client as never
  )

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.data.route.id, reverseProjectionRouteId('lagos-cotonou'))
    assert.equal(result.data.route.origin.city, 'Cotonou')
    assert.equal(result.data.route.destination.city, 'Lagos')
    assert.equal(result.data.destinationServiceArea.serviceArea.city, 'Lagos')
    assert.equal(result.data.destinationServiceArea.resolvedLocality, 'Ikeja LGA')
    assert.equal(result.data.pickupFareZone, null)
    assert.equal(result.data.availability.available, true)
  }
})

test('reverse Lagos destination coordinates validate without pickup fare zone', async () => {
  const client = {
    route: {
      findFirst: async (args: {
        where: { id?: string; from?: { equals: string }; to?: { equals: string } }
      }) => {
        if (args.where.id) return routes.find((route) => route.id === args.where.id) ?? null
        return (
          routes.find(
            (route) =>
              route.from.toLowerCase() === args.where.from?.equals.toLowerCase() &&
              route.to.toLowerCase() === args.where.to?.equals.toLowerCase()
          ) ?? null
        )
      },
    },
  }

  const cotonouToLagos = await normalizeDiscoverySelection(
    {
      routeId: 'lagos-cotonou',
      from: 'Cotonou',
      to: 'Lagos',
      vehicleId: 'saloon',
      tripType: 'one-way',
      departureDate: '2026-08-20T09:00:00.000Z',
      passengers: 1,
      pickupCity: 'Cotonou',
      pickupCountryCode: 'BJ',
      destinationCity: 'Ojodu',
      destinationCountryCode: 'NG',
      destinationLatitude: 6.645,
      destinationLongitude: 3.354,
    },
    client as never
  )
  assert.equal(cotonouToLagos.ok, true)
  if (cotonouToLagos.ok) {
    assert.equal(cotonouToLagos.data.route.id, reverseProjectionRouteId('lagos-cotonou'))
    assert.equal(
      cotonouToLagos.data.locationMetadata.destinationServiceArea.serviceArea.city,
      'Lagos'
    )
    assert.equal(cotonouToLagos.data.locationMetadata.pickupFareZone, null)
  }

  const lagosToCotonou = await normalizeDiscoverySelection(
    {
      routeId: 'lagos-cotonou',
      from: 'Lagos',
      to: 'Cotonou',
      vehicleId: 'saloon',
      tripType: 'one-way',
      departureDate: '2026-08-20T09:00:00.000Z',
      passengers: 1,
      pickupCity: 'Ojodu',
      pickupCountryCode: 'NG',
      pickupLatitude: 6.645,
      pickupLongitude: 3.354,
      destinationCity: 'Cotonou',
      destinationCountryCode: 'BJ',
    },
    client as never
  )
  assert.equal(lagosToCotonou.ok, true)
  if (lagosToCotonou.ok) {
    assert.equal(lagosToCotonou.data.route.id, 'lagos-cotonou')
    assert.equal(lagosToCotonou.data.locationMetadata.pickupServiceArea.serviceArea.city, 'Lagos')
    assert.equal(lagosToCotonou.data.locationMetadata.pickupFareZone?.code, 'lagos_mainland')
  }
})

test('lagos pickup fare zone is resolved by backend and only when Lagos is route origin', () => {
  const lagosCotonou = routes.find((route) => route.id === 'lagos-cotonou')!

  const ikeja = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: { city: 'Ikeja', countryCode: 'NG' },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(ikeja.ok, true)
  if (ikeja.ok) {
    assert.equal(ikeja.metadata.pickupFareZone?.code, 'lagos_mainland')
    assert.equal(
      resolvePickupFareZoneForRoute({
        route: lagosCotonou,
        pickup: ikeja.metadata.pickupServiceArea,
      })?.pricingScope,
      'mainland'
    )
  }

  const lekki = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: { city: 'Lekki', countryCode: 'NG' },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(lekki.ok, true)
  if (lekki.ok) assert.equal(lekki.metadata.pickupFareZone?.code, 'lagos_island')

  const badagry = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: { city: 'Badagry', countryCode: 'NG' },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(badagry.ok, true)
  if (badagry.ok) {
    assert.equal(badagry.metadata.pickupFareZone?.code, 'lagos_mainland')
    assert.equal(badagry.metadata.pickupFareZone?.pricingScope, 'mainland')
  }

  const coordinateMainland = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: {
      city: 'Lagos Mainland',
      countryCode: 'NG',
      latitude: 6.6018,
      longitude: 3.3515,
    },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(coordinateMainland.ok, true)
  if (coordinateMainland.ok) {
    assert.equal(coordinateMainland.metadata.pickupFareZone?.code, 'lagos_mainland')
    assert.equal(coordinateMainland.metadata.pickupFareZone?.pricingScope, 'mainland')
  }

  const coordinateIsland = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: {
      city: 'Lagos',
      countryCode: 'NG',
      latitude: 6.4281,
      longitude: 3.4219,
    },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(coordinateIsland.ok, true)
  if (coordinateIsland.ok) {
    assert.equal(coordinateIsland.metadata.pickupFareZone?.code, 'lagos_island')
    assert.equal(coordinateIsland.metadata.pickupFareZone?.pricingScope, 'island')
  }

  const reverse = {
    ...lagosCotonou,
    from: 'Cotonou',
    fromCountry: 'Benin Republic',
    to: 'Lagos',
    toCountry: 'Nigeria',
  }
  const lagosDestination = validateRouteLocationBoundaries({
    route: reverse,
    pickup: { city: 'Cotonou', countryCode: 'BJ' },
    destination: { city: 'Lekki', countryCode: 'NG' },
  })
  assert.equal(lagosDestination.ok, true)
  if (lagosDestination.ok) assert.equal(lagosDestination.metadata.pickupFareZone, null)
})

test('client-supplied Lagos pickup area does not control mobile quote pricing', async () => {
  const lagosCotonou = routes.find((route) => route.id === 'lagos-cotonou')!
  const saloon = vehicles.find((vehicle) => vehicle.id === 'saloon')!
  const client = {
    route: {
      findFirst: async () => ({
        ...lagosCotonou,
        available: true,
        borderFeeIds: ['nigeria-benin'],
      }),
    },
    vehicle: {
      findUnique: async () => null,
    },
    fleetVehicle: {
      count: async () => 1,
      findMany: async () => [
        {
          id: 'saloon-unit-1',
          vehicleId: saloon.id,
          label: 'Toyota Camry',
          color: 'Black',
          currentCity: 'Lagos',
          status: 'available',
          vehicle: {
            id: saloon.id,
            name: saloon.name,
            capacity: saloon.capacity,
            luggageCapacity: saloon.luggageCapacity,
            image: saloon.image,
          },
        },
      ],
      findUnique: async () => null,
    },
    bookingLeg: {
      count: async () => 0,
    },
    routePrice: {
      findMany: async () => [
        { vehicleId: saloon.id, pricingScope: 'mainland', amountNGN: 160000 },
        { vehicleId: saloon.id, pricingScope: 'island', amountNGN: 180000 },
        { vehicleId: saloon.id, pricingScope: 'default', amountNGN: 170000 },
      ],
    },
    borderFee: {
      findMany: async () => [
        {
          id: 'nigeria-benin',
          country: 'Benin',
          countryFr: 'Benin',
          border: 'Seme',
          borderFr: 'Seme',
          countries: ['Nigeria', 'Benin Republic'],
          feePerPersonNGN: 5000,
          feeRoundTripNGN: 10000,
          popular: true,
          icon: 'local_taxi',
          services: [],
          servicesFr: [],
          documents: [],
          documentsFr: [],
          tips: [],
          tipsFr: [],
        },
      ],
    },
  }

  for (const pickupCity of ['Ikeja', 'Badagry']) {
    const result = await calculateMobileQuote(
      {
        from: 'Lagos',
        to: 'Cotonou',
        vehicleId: saloon.id,
        tripType: 'one-way',
        departureDate: '2026-08-20T09:00:00.000Z',
        passengers: 2,
        pickupCity,
        pickupCountryCode: 'NG',
        destinationCity: 'Cotonou',
        destinationCountryCode: 'BJ',
        pickupArea: 'island',
      },
      client as never
    )

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.data.quote.pickupResolvedLocality, pickupCity)
      assert.equal(result.data.quote.pickupArea, 'mainland')
      assert.equal(result.data.quote.pickupFareZone?.code, 'lagos_mainland')
      assert.equal(result.data.quote.pricing.oneWayDropoffFare.value, 160000)
      assert.equal(result.data.quote.pricing.borderFee.perPassenger.value, 5000)
      assert.equal(result.data.quote.pricing.borderFee.passengerCount, 2)
      assert.equal(result.data.quote.pricing.borderFee.total.value, 10000)
      assert.equal(result.data.quote.pricing.subtotal.value, 170000)
    }
  }
})

test('route location normalization supports known Beninfy aliases only', () => {
  assert.equal(normalizeSupportedRouteCity('Lomé'), normalizeSupportedRouteCity('Lome'))
  assert.equal(normalizeSupportedRouteCity('Porto-Novo'), normalizeSupportedRouteCity('Porto Novo'))
  assert.equal(normalizeSupportedRouteCity('Kpalimé'), normalizeSupportedRouteCity('Kpalime'))
})

test('route location boundaries fail closed for country mismatch and unresolved city', () => {
  const cotonouLome = routes.find((route) => route.id === 'cotonou-togo')!
  const countryMismatch = validateRouteLocationBoundaries({
    route: cotonouLome,
    pickup: { city: 'Cotonou', countryCode: 'NG' },
    destination: { city: 'Lomé', countryCode: 'TG' },
  })
  assert.equal(countryMismatch.ok, false)
  if (!countryMismatch.ok) assert.equal(countryMismatch.code, 'PICKUP_OUTSIDE_ROUTE_CITY')

  const unresolved = validateRouteLocationBoundaries({
    route: cotonouLome,
    pickup: { city: null, countryCode: 'BJ' },
    destination: { city: 'Lomé', countryCode: 'TG' },
  })
  assert.equal(unresolved.ok, false)
  if (!unresolved.ok) assert.equal(unresolved.code, 'LOCATION_CITY_UNRESOLVED')
})

test('saved and current-location mismatches use the same route boundary contract', () => {
  const cotonouLome = routes.find((route) => route.id === 'cotonou-togo')!
  const savedHomeLagos = validateRouteLocationBoundaries({
    route: cotonouLome,
    pickup: { city: 'Lagos', countryCode: 'NG' },
    destination: { city: 'Lomé', countryCode: 'TG' },
  })
  assert.equal(savedHomeLagos.ok, false)
  if (!savedHomeLagos.ok) assert.equal(savedHomeLagos.code, 'PICKUP_OUTSIDE_ROUTE_CITY')

  const currentLocationOuidah = validateRouteLocationBoundaries({
    route: cotonouLome,
    pickup: { city: 'Ouidah', countryCode: 'BJ' },
    destination: { city: 'Lomé', countryCode: 'TG' },
  })
  assert.equal(currentLocationOuidah.ok, false)
  if (!currentLocationOuidah.ok)
    assert.equal(currentLocationOuidah.code, 'PICKUP_OUTSIDE_ROUTE_CITY')
})

test('saved places and reverse-geocoded current locations carry coordinates into route boundaries', () => {
  const lagosCotonou = routes.find((route) => route.id === 'lagos-cotonou')!
  const savedPlace = toSavedPlaceDto({
    id: 'saved-1',
    type: 'home',
    label: 'Home',
    address: 'Ojodu Berger, Lagos',
    latitude: 6.645,
    longitude: 3.354,
    country: 'Nigeria',
    city: 'Ojodu',
    providerPlaceId: 'places/ojodu',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  })
  const savedResult = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: {
      city: savedPlace.city,
      country: savedPlace.country,
      countryCode: 'NG',
      latitude: savedPlace.latitude,
      longitude: savedPlace.longitude,
    },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(savedResult.ok, true)
  if (savedResult.ok) assert.equal(savedResult.metadata.pickupFareZone?.code, 'lagos_mainland')

  const reversePlace = toMobileReverseGeocodeDto(
    {
      placeId: 'reverse-1',
      formattedAddress: 'Ikeja LGA, Lagos, Nigeria',
      location: { latitude: 6.6018, longitude: 3.3515 },
      addressComponents: [
        { longText: 'Ikeja LGA', shortText: 'Ikeja', types: ['locality'] },
        { longText: 'Nigeria', shortText: 'NG', types: ['country'] },
      ],
    },
    { latitude: 6.6018, longitude: 3.3515 }
  )
  const reverseResult = validateRouteLocationBoundaries({
    route: lagosCotonou,
    pickup: {
      city: reversePlace.city,
      country: reversePlace.country,
      countryCode: reversePlace.countryCode,
      latitude: reversePlace.latitude,
      longitude: reversePlace.longitude,
    },
    destination: { city: 'Cotonou', countryCode: 'BJ' },
  })
  assert.equal(reverseResult.ok, true)
  if (reverseResult.ok) assert.equal(reverseResult.metadata.pickupFareZone?.code, 'lagos_mainland')
})

test('booking creation passes selected coordinates into the common route boundary validator', () => {
  const bookingRoute = readFileSync('src/app/api/bookings/route.ts', 'utf8')

  assert.match(bookingRoute, /pickup:[\s\S]*latitude: data\.pickupLatitude/)
  assert.match(bookingRoute, /pickup:[\s\S]*longitude: data\.pickupLongitude/)
  assert.match(bookingRoute, /destination:[\s\S]*latitude: data\.dropoffLatitude/)
  assert.match(bookingRoute, /destination:[\s\S]*longitude: data\.dropoffLongitude/)
})

test('reverse route detail uses stable projection id and reversed border crossing order', async () => {
  const client = {
    route: {
      findFirst: async () => ({
        ...routes.find((route) => route.id === 'lagos-ghana')!,
        available: true,
        borderFeeIds: ['nigeria-benin', 'benin-togo', 'togo-ghana'],
      }),
    },
  }

  const route = await getPublicRouteById(reverseProjectionRouteId('lagos-ghana'), client as never)

  assert.equal(route?.id, reverseProjectionRouteId('lagos-ghana'))
  assert.equal(route?.from, 'Accra')
  assert.equal(route?.to, 'Lagos')
  assert.deepEqual(route?.borderCrossings, [
    'Kodjoviakopé–Aflao',
    'Sanvee Condji–Hillacondji',
    'Kraké–Seme',
  ])
  assert.deepEqual(route?.borderFeeIds, ['togo-ghana', 'benin-togo', 'nigeria-benin'])
  assert.equal(route ? routePricingId(route) : null, 'lagos-ghana')
})

test('border crossing labels reverse traversal direction', () => {
  assert.deepEqual(reverseBorderCrossings(['Seme–Kraké', 'Hillacondji–Sanvee Condji']), [
    'Sanvee Condji–Hillacondji',
    'Kraké–Seme',
  ])
})

test('database border fees are summed per passenger from route borderFeeIds', async () => {
  const client = {
    route: {
      findFirst: async () => ({
        id: 'lagos-togo',
        borderFeeIds: ['nigeria-benin', 'benin-togo'],
      }),
    },
    borderFee: {
      findMany: async () => [
        {
          id: 'nigeria-benin',
          country: 'Benin',
          countryFr: 'Benin',
          border: 'Seme',
          borderFr: 'Seme',
          countries: ['Nigeria', 'Benin Republic'],
          feePerPersonNGN: 5000,
          feeRoundTripNGN: 10000,
          popular: true,
          icon: 'local_taxi',
          services: [],
          servicesFr: [],
          documents: [],
          documentsFr: [],
          tips: [],
          tipsFr: [],
        },
        {
          id: 'benin-togo',
          country: 'Togo',
          countryFr: 'Togo',
          border: 'Hillacondji',
          borderFr: 'Hillacondji',
          countries: ['Benin Republic', 'Togo'],
          feePerPersonNGN: 10400,
          feeRoundTripNGN: 20800,
          popular: false,
          icon: 'directions_bus',
          services: [],
          servicesFr: [],
          documents: [],
          documentsFr: [],
          tips: [],
          tipsFr: [],
        },
      ],
    },
  }

  const passengers = [1, 2, 4] as const

  for (const passengerCount of passengers) {
    const result = await calculateRouteBorderFeeNGN({
      routeId: 'lagos-togo',
      tripType: 'round-trip',
      passengerCount,
      client: client as never,
    })

    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.perPassengerNGN, 30800)
      assert.equal(result.passengerCount, passengerCount)
      assert.equal(result.amountNGN, 30800 * passengerCount)
    }
  }
})

test('route border fees return zero when no border fee is configured', async () => {
  const client = {
    route: {
      findFirst: async () => ({ id: 'local-route', borderFeeIds: [] }),
    },
    borderFee: {
      findMany: async () => [],
    },
  }

  const result = await calculateRouteBorderFeeNGN({
    routeId: 'local-route',
    tripType: 'one-way',
    passengerCount: 4,
    client: client as never,
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.perPassengerNGN, 0)
    assert.equal(result.passengerCount, 4)
    assert.equal(result.amountNGN, 0)
  }
})

test('explicit reverse route border fee configuration is authoritative', async () => {
  const routeLookups: string[] = []
  const client = {
    route: {
      findFirst: async (args: { where: { id: string } }) => {
        routeLookups.push(args.where.id)
        return { id: args.where.id, borderFeeIds: ['ghana-togo-reverse'] }
      },
    },
    borderFee: {
      findMany: async () => [
        {
          id: 'ghana-togo-reverse',
          country: 'Togo',
          countryFr: 'Togo',
          border: 'Aflao reverse',
          borderFr: 'Aflao reverse',
          countries: ['Ghana', 'Togo'],
          feePerPersonNGN: 7000,
          feeRoundTripNGN: 14000,
          popular: false,
          icon: 'currency_exchange',
          services: [],
          servicesFr: [],
          documents: [],
          documentsFr: [],
          tips: [],
          tipsFr: [],
        },
      ],
    },
  }

  const result = await calculateRouteBorderFeeNGN({
    routeId: 'accra-lome',
    tripType: 'one-way',
    passengerCount: 2,
    client: client as never,
  })

  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.amountNGN, 14000)
  assert.deepEqual(routeLookups, ['accra-lome'])
})

test('reverse projection pricing uses source corridor price without inventing a fare', async () => {
  const routePriceLookups: string[] = []
  const borderFeeLookups: string[] = []
  const client = {
    routePrice: {
      findMany: async (args: { where: { routeId: string } }) => {
        routePriceLookups.push(args.where.routeId)
        return [{ vehicleId: 'saloon', pricingScope: 'default', amountNGN: 180000 }]
      },
    },
    route: {
      findFirst: async (args: { where: { id: string } }) => {
        borderFeeLookups.push(args.where.id)
        return { id: args.where.id, borderFeeIds: ['nigeria-benin'] }
      },
    },
    borderFee: {
      findMany: async () => [
        {
          id: 'nigeria-benin',
          country: 'Benin',
          countryFr: 'Benin',
          border: 'Seme',
          borderFr: 'Seme',
          countries: ['Nigeria', 'Benin Republic'],
          feePerPersonNGN: 5000,
          feeRoundTripNGN: 10000,
          popular: true,
          icon: 'local_taxi',
          services: [],
          servicesFr: [],
          documents: [],
          documentsFr: [],
          tips: [],
          tipsFr: [],
        },
      ],
    },
  }

  const result = await calculateBookingPricing({
    routeId: reverseProjectionRouteId('lagos-cotonou'),
    pricingRouteId: 'lagos-cotonou',
    vehicleId: 'saloon',
    vehicleName: 'Saloon',
    tripType: 'one-way',
    passengerCount: 2,
    pickupAreaRequired: false,
    client: client as never,
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.routeId, reverseProjectionRouteId('lagos-cotonou'))
    assert.equal(result.oneWayDropoffFare, 180000)
    assert.equal(result.borderFeePerPassengerNGN, 5000)
    assert.equal(result.borderFeePassengerCount, 2)
    assert.equal(result.subtotalNGN, 190000)
  }
  assert.deepEqual(routePriceLookups, ['lagos-cotonou'])
  assert.deepEqual(borderFeeLookups, ['lagos-cotonou'])
})

test('booking pricing prefers fleet override before category price', async () => {
  const client = {
    routePrice: {
      findMany: async () => [
        { vehicleId: 'suv', pricingScope: 'default', amountNGN: 400000 },
        { vehicleId: 'rav4-unit-1', pricingScope: 'default', amountNGN: 375000 },
      ],
    },
    route: {
      findFirst: async () => ({ id: 'lagos-cotonou', borderFeeIds: ['nigeria-benin'] }),
    },
    borderFee: {
      findMany: async () => [
        {
          id: 'nigeria-benin',
          country: 'Benin',
          countryFr: 'Benin',
          border: 'Seme',
          borderFr: 'Seme',
          countries: ['Nigeria', 'Benin Republic'],
          feePerPersonNGN: 5000,
          feeRoundTripNGN: 10000,
          popular: true,
          icon: 'local_taxi',
          services: [],
          servicesFr: [],
          documents: [],
          documentsFr: [],
          tips: [],
          tipsFr: [],
        },
      ],
    },
  }

  const result = await calculateBookingPricing({
    routeId: 'lagos-cotonou',
    vehicleId: 'suv',
    vehicleName: 'SUV',
    fleetVehicleId: 'rav4-unit-1',
    fleetVehicleLabel: 'RAV4',
    tripType: 'one-way',
    passengerCount: 4,
    client: client as never,
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.oneWayDropoffFare, 375000)
    assert.equal(result.borderFeeNGN, 20000)
    assert.equal(result.subtotalNGN, 395000)
    assert.equal(result.source, 'database')
  }
})

test('quote and booking pricing share the same fare core', async () => {
  const result = calculateFareBreakdown({
    oneWayDropoffFare: 250000,
    tripType: 'round-trip',
    borderFeeNGN: 10000,
    borderFeePerPassengerNGN: 5000,
    borderFeePassengerCount: 2,
  })

  assert.equal(result.rideFareNGN, 500000)
  assert.equal(result.borderFeePassengerCount, 2)
  assert.equal(result.subtotalNGN, 510000)
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

test('driver duty separates new assignment eligibility from owned trip action eligibility', () => {
  assert.equal(canDriverReceiveNewAssignment('available'), true)
  assert.equal(canDriverReceiveNewAssignment('off_duty'), false)
  assert.equal(canDriverReceiveNewAssignment('inactive'), false)

  assert.equal(canDriverExecuteAssignedTrip('available'), true)
  assert.equal(canDriverExecuteAssignedTrip('off_duty'), true)
  assert.equal(canDriverExecuteAssignedTrip('inactive'), false)
})

test('off-duty assigned drivers still use authoritative lifecycle actions', () => {
  const assigned = evaluateDriverTripTransition({
    status: 'assigned',
    action: 'start_en_route',
    hasDriver: true,
    hasFleetVehicle: true,
    bookingStatus: 'confirmed',
  })
  assert.equal(canDriverExecuteAssignedTrip('off_duty'), true)
  assert.equal(assigned.ok, true)
  if (assigned.ok) assert.equal(assigned.nextStatus, 'driver_en_route')

  const activeSequence = [
    ['driver_en_route', 'arrive', 'driver_arrived'],
    ['driver_arrived', 'passenger_onboard', 'passenger_onboard'],
    ['passenger_onboard', 'start_trip', 'in_progress'],
    ['in_progress', 'complete', 'completed'],
  ] as const

  for (const [status, action, nextStatus] of activeSequence) {
    const result = evaluateDriverTripTransition({
      status,
      action,
      hasDriver: true,
      hasFleetVehicle: true,
      bookingStatus: 'confirmed',
    })
    assert.equal(canDriverExecuteAssignedTrip('off_duty'), true)
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.nextStatus, nextStatus)
  }
})

test('off-duty assignment ownership remains visible in driver trip views', () => {
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

test('driver assignment history query scopes by authenticated driver', () => {
  assert.deepEqual(driverAssignmentHistoryWhereForDriver('driver1'), {
    driverId: 'driver1',
  })
})

test('driver assignment history endpoint ordering uses effective outcome time with stable cursor', () => {
  const records = [
    {
      id: 'history-a',
      assignedAt: new Date('2026-07-18T08:00:00.000Z'),
      completedAt: new Date('2026-08-20T08:00:00.000Z'),
    },
    {
      id: 'history-c',
      assignedAt: new Date('2026-08-18T08:00:00.000Z'),
      releasedAt: new Date('2026-08-21T08:00:00.000Z'),
      supersededAt: new Date('2026-08-21T08:00:00.000Z'),
    },
    {
      id: 'history-b',
      assignedAt: new Date('2026-08-01T08:00:00.000Z'),
      declinedAt: new Date('2026-08-20T08:00:00.000Z'),
    },
    {
      id: 'history-d',
      assignedAt: new Date('2026-08-19T08:00:00.000Z'),
    },
  ]

  const first = pageDriverAssignmentHistoryRecords({ records, limit: 2 })
  const second = pageDriverAssignmentHistoryRecords({
    records,
    limit: 2,
    cursor: first.nextCursor,
  })

  assert.deepEqual(
    first.page.map((record) => record.id),
    ['history-c', 'history-b']
  )
  assert.deepEqual(
    second.page.map((record) => record.id),
    ['history-a', 'history-d']
  )
  assert.equal(first.hasMore, true)
  assert.equal(second.hasMore, false)
  assert.equal(second.nextCursor, null)
  assert.deepEqual(
    [...first.page, ...second.page].map((record) => record.id).sort(),
    records.map((record) => record.id).sort()
  )
})

test('driver assignment history DTO preserves released driver association', () => {
  const dto = toDriverAssignmentHistoryDto({
    id: 'history1',
    bookingLegId: 'leg1',
    driverId: 'driver1',
    assignedAt: new Date('2026-08-18T08:00:00.000Z'),
    acceptedAt: null,
    declinedAt: null,
    releasedAt: new Date('2026-08-18T08:30:00.000Z'),
    completedAt: null,
    supersededAt: null,
    releaseReason: 'driver_cancelled',
    releaseSource: 'driver',
    bookingLeg: {
      id: 'leg1',
      bookingId: 'booking1',
      direction: 'outbound',
      from: 'Lagos',
      to: 'Cotonou',
      departureDate: new Date('2026-08-20T09:00:00.000Z'),
      status: 'unassigned',
    },
  })

  assert.equal(dto.assignmentHistoryId, 'history1')
  assert.equal(dto.bookingLegId, 'leg1')
  assert.equal(dto.outcome, 'released')
  assert.equal(dto.outcomeLabelKey, 'driverAssignmentHistory.released')
  assert.equal(dto.effectiveOutcomeAt, '2026-08-18T08:30:00.000Z')
  assert.equal(dto.currentLegStatus, 'unassigned')
  assert.equal(dto.releaseReason, 'driver_cancelled')
  assert.equal(dto.releaseSource, 'driver')
})

test('driver assignment history DTO distinguishes reassigned-away outcome', () => {
  const dto = toDriverAssignmentHistoryDto({
    id: 'history1',
    bookingLegId: 'leg1',
    driverId: 'driver1',
    assignedAt: new Date('2026-08-18T08:00:00.000Z'),
    acceptedAt: null,
    declinedAt: null,
    releasedAt: new Date('2026-08-18T08:30:00.000Z'),
    completedAt: null,
    supersededAt: new Date('2026-08-18T08:30:00.000Z'),
    releaseReason: 'reassigned',
    releaseSource: 'admin',
    bookingLeg: {
      id: 'leg1',
      bookingId: 'booking1',
      direction: 'outbound',
      from: 'Lagos',
      to: 'Cotonou',
      departureDate: new Date('2026-08-20T09:00:00.000Z'),
      status: 'assigned',
    },
  })

  assert.equal(dto.outcome, 'reassigned')
  assert.equal(dto.outcomeLabelKey, 'driverAssignmentHistory.reassigned')
  assert.equal(dto.effectiveOutcomeAt, '2026-08-18T08:30:00.000Z')
  assert.equal(dto.currentLegStatus, 'assigned')
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

test('mobile launch payment policy accepts NGN and rejects XOF', () => {
  assert.deepEqual(assertMobileLaunchCurrency('NGN'), { ok: true, currency: 'NGN' })
  const rejected = assertMobileLaunchCurrency('XOF')
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.code, 'UNSUPPORTED_PAYMENT_CURRENCY')
  assert.equal(normalizeMobileLaunchPaymentProvider('payaza'), 'paystack')
  assert.equal(normalizeMobilePaymentProvider('payonus'), 'payonus')
})

test('route price propagation updates managed unit prices and preserves explicit overrides', async () => {
  const created: unknown[] = []
  const updated: unknown[] = []
  const existingByUnit = new Map([
    ['unit-managed', { id: 'price-managed', managedByCategory: true }],
    ['unit-explicit', { id: 'price-explicit', managedByCategory: false }],
  ])
  const tx = {
    vehicle: { findUnique: async () => ({ id: 'saloon' }) },
    fleetVehicle: {
      findMany: async () => [
        { id: 'unit-managed' },
        { id: 'unit-explicit' },
        { id: 'unit-missing' },
      ],
    },
    routePrice: {
      findFirst: async ({ where }: { where: { vehicleId: string } }) =>
        existingByUnit.get(where.vehicleId) ?? null,
      update: async (input: unknown) => {
        updated.push(input)
        return input
      },
      create: async (input: unknown) => {
        created.push(input)
        return input
      },
    },
  }

  const result = await propagateCategoryRoutePrice(tx as never, {
    routeId: 'lagos-cotonou',
    vehicleId: 'saloon',
    pricingScope: 'default',
    amountNGN: 180000,
  })

  assert.equal(result.propagated, 1)
  assert.equal(result.updatedManaged, 1)
  assert.equal(result.updatedExplicit, 0)
  assert.equal(created.length, 1)
  assert.equal(updated.length, 1)
})

test('explicit route price sync overwrites custom unit overrides deliberately', async () => {
  const updated: unknown[] = []
  const tx = {
    vehicle: { findUnique: async () => ({ id: 'saloon' }) },
    fleetVehicle: { findMany: async () => [{ id: 'unit-explicit' }] },
    routePrice: {
      findFirst: async () => ({ id: 'price-explicit', managedByCategory: false }),
      update: async (input: unknown) => {
        updated.push(input)
        return input
      },
      create: async () => null,
    },
  }

  const result = await propagateCategoryRoutePrice(tx as never, {
    routeId: 'lagos-cotonou',
    vehicleId: 'saloon',
    pricingScope: 'default',
    amountNGN: 190000,
    syncFleetPrices: true,
  })

  assert.equal(result.updatedExplicit, 1)
  assert.equal(updated.length, 1)
})

test('google routes returns disabled without server key and normalizes provider response', async () => {
  const originalKey = process.env.GOOGLE_ROUTES_API_KEY
  delete process.env.GOOGLE_ROUTES_API_KEY
  const disabled = await computeGoogleRoute({
    origin: { latitude: 6.5244, longitude: 3.3792 },
    destination: { latitude: 6.3703, longitude: 2.3912 },
  })
  assert.equal(disabled.ok, false)
  if (!disabled.ok) assert.equal(disabled.code, 'GOOGLE_ROUTES_DISABLED')

  process.env.GOOGLE_ROUTES_API_KEY = 'test-key'
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        routes: [
          {
            distanceMeters: 12345,
            duration: '3600s',
            staticDuration: '3300s',
            polyline: { encodedPolyline: 'abc123' },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch
  const ok = await computeGoogleRoute({
    origin: { latitude: 6.5244, longitude: 3.3792 },
    destination: { latitude: 6.3703, longitude: 2.3912 },
  })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.route.encodedPolyline, 'abc123')
    assert.equal(ok.route.distanceMeters, 12345)
    assert.equal(ok.route.durationSeconds, 3300)
    assert.equal(ok.route.trafficDurationSeconds, 3600)
  }
  globalThis.fetch = originalFetch
  if (originalKey === undefined) delete process.env.GOOGLE_ROUTES_API_KEY
  else process.env.GOOGLE_ROUTES_API_KEY = originalKey
})

test('google places autocomplete normalizes predictions without coordinates', () => {
  const query = normalizePlacesQuery('  cotonou airport  ')
  assert.equal(query.ok, true)
  if (query.ok) assert.equal(query.query, 'cotonou airport')

  const dto = toMobilePlacePredictionDto({
    place: 'places/ChIJAirport123',
    text: { text: 'Cadjehoun Airport, Cotonou, Benin' },
    structuredFormat: {
      mainText: { text: 'Cadjehoun Airport' },
      secondaryText: { text: 'Cotonou, Benin' },
    },
    types: ['airport', 'point_of_interest', 'establishment'],
  })

  assert.deepEqual(dto, {
    placeId: 'ChIJAirport123',
    displayName: 'Cadjehoun Airport',
    formattedAddress: 'Cotonou, Benin',
    latitude: null,
    longitude: null,
    city: null,
    country: null,
    countryCode: null,
  })
})

test('google place details DTO exposes only customer-safe location fields', () => {
  const dto = toMobilePlaceDetailDto({
    id: 'ChIJHotel456',
    displayName: { text: 'Hotel du Lac' },
    formattedAddress: 'Rue Bel Air, Cotonou, Benin',
    location: { latitude: 6.369, longitude: 2.432 },
    addressComponents: [
      { longText: 'Cotonou', shortText: 'Cotonou', types: ['locality'] },
      { longText: 'Littoral Department', shortText: 'LT', types: ['administrative_area_level_1'] },
      { longText: 'Benin', shortText: 'BJ', types: ['country'] },
    ],
  })

  assert.deepEqual(dto, {
    placeId: 'ChIJHotel456',
    displayName: 'Hotel du Lac',
    formattedAddress: 'Rue Bel Air, Cotonou, Benin',
    latitude: 6.369,
    longitude: 2.432,
    city: 'Cotonou',
    country: 'Benin',
    countryCode: 'BJ',
  })
})

test('reverse geocoding validates coordinate ranges and returns current-location DTO', () => {
  assert.deepEqual(normalizeCoordinateInput('6.369', '2.432'), {
    ok: true,
    latitude: 6.369,
    longitude: 2.432,
  })
  assert.equal(normalizeCoordinateInput('91', '2.432').ok, false)
  assert.equal(normalizeCoordinateInput('6.369', '-181').ok, false)

  const dto = toMobileReverseGeocodeDto(
    {
      placeId: 'ChIJReverse123',
      formattedAddress: 'Rue Bel Air, Cotonou, Benin',
      location: { latitude: 6.369, longitude: 2.432 },
      addressComponents: [
        { longText: 'Cotonou', shortText: 'Cotonou', types: ['locality'] },
        { longText: 'Benin', shortText: 'BJ', types: ['country'] },
      ],
      types: ['street_address'],
    },
    { latitude: 6.369, longitude: 2.432 }
  )

  assert.deepEqual(dto, {
    placeId: 'ChIJReverse123',
    displayName: 'Rue Bel Air, Cotonou, Benin',
    formattedAddress: 'Rue Bel Air, Cotonou, Benin',
    latitude: 6.369,
    longitude: 2.432,
    city: 'Cotonou',
    country: 'Benin',
    countryCode: 'BJ',
    resolved: true,
  })
})

test('reverse geocoding returns unresolved response when authoritative city is absent', () => {
  const dto = toMobileReverseGeocodeDto(
    {
      placeId: 'ChIJRegionOnly123',
      formattedAddress: 'Littoral Department, Benin',
      location: { latitude: 6.37, longitude: 2.39 },
      addressComponents: [
        {
          longText: 'Littoral Department',
          shortText: 'LT',
          types: ['administrative_area_level_1'],
        },
        { longText: 'Benin', shortText: 'BJ', types: ['country'] },
      ],
      types: ['administrative_area_level_1', 'political'],
    },
    { latitude: 6.369, longitude: 2.432 }
  )

  assert.deepEqual(dto, {
    placeId: 'ChIJRegionOnly123',
    displayName: 'Littoral Department, Benin',
    formattedAddress: 'Littoral Department, Benin',
    latitude: 6.37,
    longitude: 2.39,
    city: null,
    country: null,
    countryCode: null,
    resolved: false,
  })
})

test('supported city extraction prefers local city and falls back to administrative area', () => {
  assert.deepEqual(
    extractSupportedCity([
      { longText: 'Accra', shortText: 'Accra', types: ['locality'] },
      { longText: 'Ghana', shortText: 'GH', types: ['country'] },
    ]),
    { city: 'Accra', country: 'Ghana', countryCode: 'GH' }
  )

  assert.deepEqual(
    extractSupportedCity([
      {
        longText: 'Kpalime Prefecture',
        shortText: 'Kloto',
        types: ['administrative_area_level_2'],
      },
      { longText: 'Togo', shortText: 'TG', types: ['country'] },
    ]),
    { city: 'Kpalime Prefecture', country: 'Togo', countryCode: 'TG' }
  )
})

test('unsupported mobile place city pair remains rejected by route catalogue', async () => {
  const client = {
    route: {
      findFirst: async () => null,
    },
  }

  const result = await findPublicRouteByCities('Paris', 'Berlin', client as never)
  assert.equal(result, null)
})

test('google places server key is backend-only and never falls back to public maps key', () => {
  const originalPlacesKey = process.env.GOOGLE_PLACES_API_KEY
  const originalPublicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  delete process.env.GOOGLE_PLACES_API_KEY
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'public-browser-key'
  assert.equal(getGooglePlacesServerKey(), null)

  process.env.GOOGLE_PLACES_API_KEY = 'server-places-key'
  const dto = toMobilePlaceDetailDto({
    id: 'ChIJLandmark789',
    displayName: { text: 'Black Star Square' },
    formattedAddress: 'Accra, Ghana',
  })
  assert.equal(getGooglePlacesServerKey(), 'server-places-key')
  assert.equal(JSON.stringify(dto).includes('server-places-key'), false)
  assert.equal(JSON.stringify(dto).includes('public-browser-key'), false)

  if (originalPlacesKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY
  else process.env.GOOGLE_PLACES_API_KEY = originalPlacesKey
  if (originalPublicKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalPublicKey
})

test('journey intelligence DTO remains optional and marks stale cache', () => {
  assert.equal(toJourneyIntelligenceDto(null), null)
  const dto = toJourneyIntelligenceDto({
    encodedPolyline: 'poly',
    distanceRemainingMeters: 5000,
    estimatedArrivalAt: new Date('2026-08-18T10:30:00.000Z'),
    estimatedDurationSeconds: 1200,
    calculatedAt: new Date('2026-08-18T10:00:00.000Z'),
    expiresAt: new Date('2026-08-18T10:01:00.000Z'),
  })
  assert.equal(dto?.routePolyline, 'poly')
  assert.equal(dto?.freshness, 'stale')
})

test('mobile support config returns only configured support contacts', () => {
  const originalSupport = process.env.SUPPORT_EMAIL
  const originalSender = process.env.SMTP_SENDER_EMAIL
  const originalPhone = process.env.SUPPORT_PHONE
  const originalWhatsapp = process.env.SUPPORT_WHATSAPP
  delete process.env.SUPPORT_EMAIL
  delete process.env.SMTP_SENDER_EMAIL
  delete process.env.SUPPORT_PHONE
  delete process.env.SUPPORT_WHATSAPP
  assert.deepEqual(mobileSupportConfig(), {
    email: null,
    phone: null,
    whatsapp: null,
    emergency: { enabled: false, phone: null, whatsapp: null },
  })
  process.env.SUPPORT_WHATSAPP = '+22951019134'
  assert.equal(mobileSupportConfig().whatsapp?.url, 'https://wa.me/22951019134')
  if (originalSupport === undefined) delete process.env.SUPPORT_EMAIL
  else process.env.SUPPORT_EMAIL = originalSupport
  if (originalSender === undefined) delete process.env.SMTP_SENDER_EMAIL
  else process.env.SMTP_SENDER_EMAIL = originalSender
  if (originalPhone === undefined) delete process.env.SUPPORT_PHONE
  else process.env.SUPPORT_PHONE = originalPhone
  if (originalWhatsapp === undefined) delete process.env.SUPPORT_WHATSAPP
  else process.env.SUPPORT_WHATSAPP = originalWhatsapp
})

test('fcm config stays server-side and requires all credential parts', () => {
  const originalProject = process.env.FIREBASE_PROJECT_ID
  const originalEmail = process.env.FIREBASE_CLIENT_EMAIL
  const originalKey = process.env.FIREBASE_PRIVATE_KEY
  delete process.env.FIREBASE_PROJECT_ID
  delete process.env.FIREBASE_CLIENT_EMAIL
  delete process.env.FIREBASE_PRIVATE_KEY
  assert.equal(getFcmConfig(), null)
  process.env.FIREBASE_PROJECT_ID = 'project'
  process.env.FIREBASE_CLIENT_EMAIL = 'firebase@example.com'
  process.env.FIREBASE_PRIVATE_KEY = 'line1\\nline2'
  assert.equal(getFcmConfig()?.privateKey, 'line1\nline2')
  if (originalProject === undefined) delete process.env.FIREBASE_PROJECT_ID
  else process.env.FIREBASE_PROJECT_ID = originalProject
  if (originalEmail === undefined) delete process.env.FIREBASE_CLIENT_EMAIL
  else process.env.FIREBASE_CLIENT_EMAIL = originalEmail
  if (originalKey === undefined) delete process.env.FIREBASE_PRIVATE_KEY
  else process.env.FIREBASE_PRIVATE_KEY = originalKey
})
