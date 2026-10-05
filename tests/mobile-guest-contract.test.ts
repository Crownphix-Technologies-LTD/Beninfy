import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  GUEST_REQUEST_MAX_BYTES,
  guestRideSelectionSchema,
  guestTourQuoteSchema,
  readGuestJson,
  toGuestAvailabilityDto,
  toGuestRideQuoteDto,
} from '../src/lib/mobile/guestDiscovery'

const rideSelection = {
  routeId: 'lagos-cotonou',
  from: 'Lagos',
  to: 'Cotonou',
  vehicleId: 'saloon',
  tripType: 'one-way',
  departureDate: '2026-11-10',
  passengers: 2,
  pickupCity: 'Ikeja',
  pickupCountryCode: 'NG',
  pickupLatitude: 6.6018,
  pickupLongitude: 3.3515,
  destinationCity: 'Cotonou',
  destinationCountryCode: 'BJ',
  destinationLatitude: 6.3703,
  destinationLongitude: 2.3912,
}

test('guest Ride selection accepts current-location coordinates but rejects malformed coordinates', () => {
  assert.equal(guestRideSelectionSchema.safeParse(rideSelection).success, true)
  assert.equal(
    guestRideSelectionSchema.safeParse({ ...rideSelection, pickupLatitude: 91 }).success,
    false
  )
})

test('guest Ride selection rejects physical fleet targeting and coupon eligibility', () => {
  assert.equal(
    guestRideSelectionSchema.safeParse({ ...rideSelection, fleetVehicleId: 'fleet_1' }).success,
    false
  )
  assert.equal(
    guestRideSelectionSchema.safeParse({ ...rideSelection, couponCode: 'PRIVATE10' }).success,
    false
  )
})

test('guest request reader enforces a bounded JSON object body', async () => {
  const accepted = await readGuestJson(
    new Request('https://example.test', { method: 'POST', body: JSON.stringify(rideSelection) })
  )
  assert.equal(accepted.ok, true)

  const oversized = await readGuestJson(
    new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ padding: 'x'.repeat(GUEST_REQUEST_MAX_BYTES) }),
    })
  )
  assert.deepEqual(oversized, { ok: false, reason: 'too_large' })
})

test('guest availability strips physical fleet identity and operational counts', () => {
  const dto = toGuestAvailabilityDto({
    route: { id: 'lagos-cotonou' },
    vehicle: { id: 'saloon' },
    fleetVehicle: { id: 'fleet_1', label: 'Unit 1' },
    availability: {
      status: 'available',
      available: true,
      availableCount: 2,
      physicalFleetCount: 3,
      selectableFleetUnits: [{ id: 'fleet_1' }],
      informationalOnly: true,
      dates: [{ date: '2026-11-10T00:00:00.000Z', available: true, availableCount: 2 }],
    },
  })

  const json = JSON.stringify(dto)
  assert.equal(dto.guest, true)
  assert.equal(json.includes('fleet_1'), false)
  assert.equal(json.includes('availableCount'), false)
  assert.equal(json.includes('physicalFleetCount'), false)
  assert.equal(json.includes('selectableFleetUnits'), false)
})

test('guest Ride quote strips fleet and coupon state and requires authenticated revalidation', () => {
  const dto = toGuestRideQuoteDto({
    quote: {
      route: { id: 'lagos-cotonou' },
      vehicle: { id: 'saloon' },
      fleetVehicle: { id: 'fleet_1' },
      coupon: { code: 'PRIVATE10' },
      pricing: { total: { minorValue: 100_000_00 } },
      availability: {
        status: 'available',
        available: true,
        availableCount: 1,
        physicalFleetCount: 1,
        selectableFleetUnits: [{ id: 'fleet_1' }],
        informationalOnly: true,
        dates: [{ date: '2026-11-10T00:00:00.000Z', available: true }],
      },
    },
  })
  assert.equal(dto.quote.coupon, null)
  assert.equal(dto.quote.revalidationRequired, true)
  assert.equal(JSON.stringify(dto).includes('fleet_1'), false)
})

test('guest Tour quote validates coordinates, canonical products and bounded travellers', () => {
  const input = {
    tourIds: ['cotonou-city-tour'],
    vehicleCategoryId: 'saloon',
    startDate: '2026-11-10',
    travellers: 2,
    pickup: {
      label: 'Hotel',
      address: 'Cotonou, Benin',
      coordinates: { latitude: 6.3703, longitude: 2.3912 },
    },
  }
  assert.equal(guestTourQuoteSchema.safeParse(input).success, true)
  assert.equal(
    guestTourQuoteSchema.safeParse({
      ...input,
      pickup: { ...input.pickup, coordinates: { latitude: 200, longitude: 2.3912 } },
    }).success,
    false
  )
})

test('guest routes are explicit, rate limited and do not weaken authenticated ownership routes', () => {
  const guestRoutes = [
    'src/app/api/mobile/v1/guest/places/autocomplete/route.ts',
    'src/app/api/mobile/v1/guest/places/[placeId]/route.ts',
    'src/app/api/mobile/v1/guest/places/reverse/route.ts',
    'src/app/api/mobile/v1/guest/availability/route.ts',
    'src/app/api/mobile/v1/guest/rides/quote/route.ts',
    'src/app/api/mobile/v1/guest/tours/quote/route.ts',
  ]
  for (const path of guestRoutes) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /checkRateLimit/)
    assert.doesNotMatch(source, /requireMobilePrincipal/)
  }

  for (const path of [
    'src/app/api/mobile/v1/customer/bookings/route.ts',
    'src/app/api/mobile/v1/customer/tours/[tourId]/book/route.ts',
    'src/app/api/mobile/v1/customer/bookings/[bookingId]/payment/route.ts',
    'src/app/api/mobile/v1/notifications/route.ts',
    'src/app/api/mobile/v1/customer/saved-travellers/route.ts',
  ]) {
    assert.match(readFileSync(path, 'utf8'), /requireMobilePrincipal/)
  }
})

test('guest quote routes calculate previews only and create no booking or payment', () => {
  for (const path of [
    'src/app/api/mobile/v1/guest/rides/quote/route.ts',
    'src/app/api/mobile/v1/guest/tours/quote/route.ts',
  ]) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /\.booking\.create|createCustomerTourBooking|initialize.*Payment/i)
    assert.match(source, /revalidationRequired|toGuestRideQuoteDto/)
  }
})
