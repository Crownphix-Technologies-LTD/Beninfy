import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import {
  CANONICAL_TOUR_IDS,
  INITIAL_TOUR_RATES_MINOR,
  calculateTourCommercialSnapshot,
  tourCommercialSelectionSchema,
  tourVehicleQualifies,
  canonicalTourExecutionReadiness,
} from '../src/lib/tourCommercial'
import { isCotonouTourPickup } from '../src/lib/mobile/tourPickupTerritory'
import {
  createCustomerTourBooking,
  quoteCustomerTourSelection,
} from '../src/lib/mobile/tourBookings'
import { initiateMobileTourBookingPayment } from '../src/lib/mobile/tourPayments'
import { approveTourOperationsQuote } from '../src/lib/admin/tourCommercial'

for (const [category, priceMinor] of Object.entries(INITIAL_TOUR_RATES_MINOR)) {
  for (const count of [1, 2, 3]) {
    test(`${category}: ${count} selected Tours use integer per-Tour pricing`, () => {
      const result = calculateTourCommercialSnapshot({
        tourIds: CANONICAL_TOUR_IDS.slice(0, count),
        priceMinor,
        gogotinkpo: false,
      })
      assert.equal(result.totalMinor, priceMinor * count)
      assert.equal(result.priceNGN, (priceMinor * count) / 100)
      assert.equal(result.components.length, count)
      assert.ok(Number.isInteger(result.totalMinor))
    })
  }
}

test('Gogotinkpo adds 20% to Cotonou only for every confirmed vehicle rate', () => {
  for (const priceMinor of Object.values(INITIAL_TOUR_RATES_MINOR)) {
    for (const count of [1, 2, 3]) {
      const result = calculateTourCommercialSnapshot({
        tourIds: CANONICAL_TOUR_IDS.slice(0, count),
        priceMinor,
        gogotinkpo: true,
      })
      assert.equal(result.totalMinor, priceMinor * count + priceMinor / 5)
      assert.equal(result.components[0].addonMinor, priceMinor / 5)
      assert.ok(result.components.slice(1).every((component) => component.addonMinor === 0))
    }
  }
  assert.equal(
    calculateTourCommercialSnapshot({
      tourIds: [...CANONICAL_TOUR_IDS],
      priceMinor: INITIAL_TOUR_RATES_MINOR.suv,
      gogotinkpo: true,
    }).priceNGN,
    560_000
  )
  assert.equal(
    calculateTourCommercialSnapshot({
      tourIds: [...CANONICAL_TOUR_IDS],
      priceMinor: INITIAL_TOUR_RATES_MINOR.gx460,
      gogotinkpo: true,
    }).priceNGN,
    640_000
  )
})

test('selection rejects duplicates, unknown products and Gogotinkpo without Cotonou', () => {
  const base = { vehicleCategoryId: 'saloon' }
  for (const input of [
    { ...base, tourIds: [] },
    { ...base, tourIds: ['other'] },
    { ...base, tourIds: ['ouidah-tour', 'ouidah-tour'] },
    { ...base, tourIds: ['ouidah-tour'], gogotinkpo: true },
    { ...base, tourIds: ['ganvie-tour'], itineraryMode: 'custom' },
  ])
    assert.equal(tourCommercialSelectionSchema.safeParse(input).success, false)
})

test('canonical order and Ganvie transportation-only flag survive combination pricing', () => {
  const result = calculateTourCommercialSnapshot({
    tourIds: ['ganvie-tour', 'ouidah-tour'],
    priceMinor: INITIAL_TOUR_RATES_MINOR.sedan,
    gogotinkpo: false,
  })
  assert.deepEqual(
    result.components.map((component) => component.tourId),
    ['ouidah-tour', 'ganvie-tour']
  )
  assert.equal(result.components[1].transportationOnly, true)
  assert.equal(result.components[0].transportationOnly, false)
})

test('Cotonou territory check fails closed for foreign, unresolved and outside localities', () => {
  assert.equal(isCotonouTourPickup({ city: 'Cotonou', countryCode: 'BJ', resolved: true }), true)
  for (const place of [
    { city: 'Cotonou', countryCode: 'NG', resolved: true },
    { city: 'Ouidah', countryCode: 'BJ', resolved: true },
    { city: 'Porto Novo', countryCode: 'BJ', resolved: true },
    { city: null, countryCode: 'BJ', resolved: false },
  ])
    assert.equal(isCotonouTourPickup(place), false)
})

const principal = {
  type: 'CUSTOMER' as const,
  userId: 'fixture-customer',
  role: 'user',
  email: 'fixture@example.test',
  sessionId: 'fixture-session',
}
const pickup = {
  label: 'Fixture hotel',
  address: 'Fixture address',
  coordinates: { latitude: 6.37, longitude: 2.43 },
}
const baseInput = {
  principal,
  tourId: CANONICAL_TOUR_IDS[0],
  tourIds: [...CANONICAL_TOUR_IDS],
  vehicleCategoryId: 'saloon',
  startDate: '2099-01-01',
  travellers: 2,
  pickup,
}

function setup(t: TestContext, city = 'Cotonou') {
  const originalKey = process.env.GOOGLE_PLACES_API_KEY
  process.env.GOOGLE_PLACES_API_KEY = 'fixture-only-google-key'
  t.after(() => {
    if (originalKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY
    else process.env.GOOGLE_PLACES_API_KEY = originalKey
  })
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      results: [
        {
          addressComponents: [
            { longText: city, shortText: city, types: ['locality'] },
            { longText: 'Benin', shortText: 'BJ', types: ['country'] },
          ],
        },
      ],
    })
  )
  const tours = CANONICAL_TOUR_IDS.map((id) => ({
    id,
    active: true,
    title: id,
    titleFr: null,
    destination: id,
    destinationFr: null,
    country: 'Benin Republic',
    countryFr: null,
    image: null,
    description: 'Fixture',
    descriptionFr: null,
    startingFromNGN: 999,
    durationDays: 1,
    itineraryDays: [
      {
        id: 'day-' + id,
        dayNumber: 1,
        title: id,
        titleFr: null,
        description: null,
        descriptionFr: null,
        defaultStartLabel: null,
        defaultStartAddress: null,
        defaultStartLatitude: null,
        defaultStartLongitude: null,
        defaultEndLabel: null,
        defaultEndAddress: null,
        defaultEndLatitude: null,
        defaultEndLongitude: null,
        stops: [
          {
            id: 'stop-' + id,
            sortOrder: 1,
            title: id,
            titleFr: null,
            description: null,
            descriptionFr: null,
            address: 'Fixture stop',
            latitude: 6.38,
            longitude: 2.44,
            estimatedDurationMinutes: 30,
            required: true,
            addonCode: null,
          },
          ...(id === CANONICAL_TOUR_IDS[0]
            ? [
                {
                  id: 'gogo-stop',
                  sortOrder: 2,
                  title: 'Gogotinkpo',
                  titleFr: null,
                  description: null,
                  descriptionFr: null,
                  address: 'Fixture addon',
                  latitude: 6.38,
                  longitude: 2.44,
                  estimatedDurationMinutes: 30,
                  required: true,
                  addonCode: 'gogotinkpo',
                },
              ]
            : []),
        ],
      },
    ],
  }))
  let captured: Prisma.TourBookingCreateArgs['data'] | undefined
  const client = {
    tour: { findMany: async () => tours },
    vehicle: {
      findUnique: async () => ({
        id: 'saloon',
        name: 'Sedan',
        capacity: 4,
        available: true,
        tourPricingCategory: 'sedan',
      }),
    },
    tourCommercialRate: {
      findUnique: async () => ({
        id: 'sedan',
        active: true,
        priceMinor: INITIAL_TOUR_RATES_MINOR.sedan,
      }),
    },
    tourBooking: { findFirst: async () => null },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        tourBooking: {
          findUnique: async () => null,
          create: async ({ data }: Prisma.TourBookingCreateArgs) => {
            captured = data
            const now = new Date()
            const createdDays = data.days
              ?.create as Prisma.TourBookingDayCreateWithoutTourBookingInput[]
            return {
              ...data,
              id: 'fixture-booking',
              paymentProvider: null,
              paymentReference: null,
              cancelledAt: null,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
              days: createdDays.map((day, index) => ({
                ...day,
                id: 'execution-day-' + index,
                assignedDriverId: null,
                assignedFleetVehicleId: null,
                stops: (
                  day.stops?.create as Prisma.TourStopExecutionCreateWithoutTourBookingDayInput[]
                ).map((stop, i) => ({ ...stop, id: 'execution-stop-' + index + '-' + i })),
              })),
            }
          },
        },
      }),
  } as unknown as typeof prisma
  return { tours, client, captured: () => captured }
}

test('incomplete template blocks standard booking and quote; custom requests never snapshot draft coordinates', async (t) => {
  const fixture = setup(t)
  Object.assign(fixture.tours[0].itineraryDays[0].stops[0], {
    address: null,
    latitude: null,
    longitude: null,
  })
  const notReady = {
    ok: false,
    code: 'TOUR_NOT_EXECUTION_READY',
    readiness: { executionReady: false, reason: 'missing_stop_coordinates' },
  }
  assert.deepEqual(await createCustomerTourBooking(baseInput, fixture.client), notReady)
  assert.deepEqual(await quoteCustomerTourSelection(baseInput, fixture.client), notReady)
  assert.equal(fixture.captured(), undefined)
  const custom = await createCustomerTourBooking(
    {
      ...baseInput,
      itineraryMode: 'custom',
      customItinerary: 'Review this custom itinerary before execution.',
    },
    fixture.client
  )
  assert.ok(custom.ok)
  assert.equal(custom.booking.status, 'quote_pending')
  assert.equal(custom.booking.days[0].stops.length, 0)
  assert.ok(
    custom.booking.days
      .flatMap((day) => day.stops)
      .every(
        (stop) =>
          stop.address && typeof stop.latitude === 'number' && typeof stop.longitude === 'number'
      )
  )
})

test('Operations quote rejects names-only execution stops before any operational writes', async () => {
  const approved = await approveTourOperationsQuote('unused', {
    priceNGN: 100000,
    expectedUpdatedAt: new Date().toISOString(),
    days: [{ dayNumber: 1, title: 'Draft day', stops: [{ sortOrder: 1, title: 'Draft stop' }] }],
  })
  assert.equal(approved.ok, false)
  if (!approved.ok) assert.equal(approved.status, 400)
})

test('combined selection creates one booking with canonical Day identities, shared pickup and fixed total', async (t) => {
  const fixture = setup(t)
  const result = await createCustomerTourBooking(
    { ...baseInput, tourIds: [...baseInput.tourIds].reverse(), gogotinkpo: true },
    fixture.client
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.dto.price.value, 320_000)
  assert.deepEqual(result.dto.selectedTourIds, [...CANONICAL_TOUR_IDS])
  assert.deepEqual(
    result.dto.days.map((day) => day.sourceTourId),
    [...CANONICAL_TOUR_IDS]
  )
  assert.deepEqual(
    result.dto.days.map((day) => day.dayNumber),
    [1, 2, 3]
  )
  assert.ok(result.dto.days.every((day) => day.pickup.address === pickup.address))
  assert.equal(result.dto.days[0].componentPriceMinor, 12_000_000)
  assert.equal(result.dto.days[2].transportationOnly, true)
  assert.equal(result.dto.vehicleCategory?.id, 'saloon')
  assert.equal(fixture.captured()?.priceNGN, 320_000)
  assert.equal(result.dto.payment.canInitialize, true)
  assert.ok(!JSON.stringify(result.dto).includes('fixture-only-google-key'))
})

test('standard Day snapshots exclude Gogotinkpo unless selected; travellers do not multiply price', async (t) => {
  const fixture = setup(t)
  for (const travellers of [1, 4]) {
    const result = await createCustomerTourBooking({ ...baseInput, travellers }, fixture.client)
    assert.equal(result.ok, true)
    if (!result.ok) continue
    assert.equal(result.dto.price.value, 300_000)
    assert.equal(result.dto.days[0].stops.length, 1)
    assert.equal(result.dto.days[0].gogotinkpo, false)
  }
  const overCapacity = await createCustomerTourBooking(
    { ...baseInput, travellers: 5 },
    fixture.client
  )
  assert.deepEqual(overCapacity, { ok: false, code: 'TOUR_TRAVELLER_COUNT_INVALID' })
})

test('outside Cotonou GPS cannot be booked even with a Cotonou-looking address label', async (t) => {
  const fixture = setup(t, 'Ouidah')
  const result = await createCustomerTourBooking(
    { ...baseInput, pickup: { ...pickup, label: 'Cotonou' } },
    fixture.client
  )
  assert.deepEqual(result, { ok: false, code: 'TOUR_PICKUP_OUTSIDE_COTONOU' })
  assert.equal(fixture.captured(), undefined)
})

test('archived canonical products are not sellable', async (t) => {
  const fixture = setup(t)
  t.mock.method(fixture.client.tour, 'findMany', async () => fixture.tours.slice(1))
  const result = await createCustomerTourBooking(baseInput, fixture.client)
  assert.deepEqual(result, { ok: false, code: 'TOUR_NOT_FOUND' })
})

test('custom selection creates a quote-pending booking and can request an unconfigured itinerary', async (t) => {
  const fixture = setup(t)
  t.mock.method(fixture.client.tour, 'findMany', async () =>
    fixture.tours.map((tour) => ({ ...tour, itineraryDays: [] }))
  )
  const result = await createCustomerTourBooking(
    {
      ...baseInput,
      itineraryMode: 'custom',
      customItinerary: 'Please arrange a custom itinerary.',
    },
    fixture.client
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.dto.status, 'quote_pending')
  assert.equal(result.dto.quoteStatus, 'pending')
  assert.equal(result.dto.payment.canInitialize, false)
  assert.equal(result.dto.days.length, 3)
  assert.ok(result.dto.days.every((day) => day.componentPriceMinor === null))
  assert.equal((result.dto.commercial as { totalMinor: unknown }).totalMinor, null)
  t.mock.method(fixture.client.tourBooking, 'findFirst', async () => ({
    ...result.booking,
    user: {},
    payments: [],
  }))
  assert.deepEqual(
    await initiateMobileTourBookingPayment(
      {
        tourBookingId: 'fixture-booking',
        principal,
        provider: 'paystack',
        locale: 'en',
        origin: 'https://example.test',
      },
      fixture.client
    ),
    { ok: false, code: 'TOUR_QUOTE_REQUIRED' }
  )
})

test('checkout quote and booking creation use the same authoritative commercial calculation', async (t) => {
  const fixture = setup(t)
  const quote = await quoteCustomerTourSelection({ ...baseInput, gogotinkpo: true }, fixture.client)
  const booking = await createCustomerTourBooking(
    { ...baseInput, gogotinkpo: true },
    fixture.client
  )
  assert.equal(quote.ok, true)
  assert.equal(booking.ok, true)
  if (!quote.ok || !booking.ok) return
  assert.equal(quote.dto.pricing?.totalMinor, booking.dto.price.minorValue)
  assert.equal(quote.dto.totalDays, booking.dto.days.length)
})

test('Operations cannot approve an empty execution plan or fractional/zero quote', async () => {
  for (const priceNGN of [0, 0.5, 100]) {
    const result = await approveTourOperationsQuote('unused', {
      days: [],
      expectedUpdatedAt: new Date().toISOString(),
      priceNGN,
    })
    assert.equal(result.ok, false)
  }
})

test('Operations quote approves the full amount once, preserves source Day identity and rejects stale saves', async (t) => {
  const fixture = setup(t)
  const result = await createCustomerTourBooking(
    {
      ...baseInput,
      itineraryMode: 'custom',
      customItinerary: 'A custom route with approved stops.',
    },
    fixture.client
  )
  assert.ok(result.ok)
  const stored = { ...result.booking, payments: [] }
  const dayWrites: Array<{ where: { id: string }; data: Prisma.TourBookingDayUpdateInput }> = []
  t.mock.method(fixture.client, '$transaction', async (callback: (tx: unknown) => unknown) =>
    callback({
      $queryRaw: async () => [],
      tourBooking: {
        findUnique: async () => stored,
        update: async ({ data }: { data: object }) => Object.assign(stored, data),
      },
      tourStopExecution: { deleteMany: async () => ({ count: 0 }) },
      tourBookingDay: {
        update: async (write: (typeof dayWrites)[number]) => {
          dayWrites.push(write)
          return {}
        },
      },
    })
  )
  const payload = {
    priceNGN: 425_000,
    expectedUpdatedAt: new Date(stored.updatedAt).toISOString(),
    days: stored.days.map((day) => ({
      dayNumber: day.dayNumber,
      title: day.title,
      defaultStartLabel: day.pickupLabel,
      defaultStartAddress: day.pickupAddress,
      defaultStartLatitude: day.pickupLatitude,
      defaultStartLongitude: day.pickupLongitude,
      stops: day.stops.map((stop) => ({
        sortOrder: stop.sortOrder,
        title: stop.title,
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        required: true,
      })),
    })),
  }
  const stale = await approveTourOperationsQuote(
    stored.id,
    { ...payload, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' },
    fixture.client
  )
  assert.equal(stale.ok, false)
  if (!stale.ok) assert.equal(stale.status, 409)
  assert.equal(dayWrites.length, 0)
  assert.equal((await approveTourOperationsQuote(stored.id, payload, fixture.client)).ok, true)
  assert.equal(stored.priceNGN, 425_000)
  assert.equal(stored.status, 'payment_pending')
  assert.equal(stored.quoteStatus, 'approved')
  assert.equal((stored.commercialSnapshot as { totalMinor: number }).totalMinor, 42_500_000)
  assert.deepEqual(
    dayWrites.map((write) => write.where.id),
    stored.days.map((day) => day.id)
  )
  assert.ok(
    dayWrites.every((write) => !('sourceTourId' in write.data) && !('scheduledDate' in write.data))
  )
  const duplicate = await approveTourOperationsQuote(stored.id, payload, fixture.client)
  assert.equal(duplicate.ok, false)
  if (!duplicate.ok) assert.equal(duplicate.status, 409)
})

test('Operations may assign a qualifying physical car without changing the commercial category or amount', () => {
  const input = {
    selectedCategoryId: 'saloon',
    selectedPricingCategory: 'sedan',
    travellers: 3,
    vehicle: { id: 'camry', tourPricingCategory: 'sedan', capacity: 4, available: true },
  }
  assert.equal(tourVehicleQualifies(input), true)
  assert.equal(
    tourVehicleQualifies({ ...input, vehicle: { ...input.vehicle, tourPricingCategory: 'suv' } }),
    false
  )
  assert.equal(tourVehicleQualifies({ ...input, travellers: 5 }), false)
  assert.equal(
    tourVehicleQualifies({ ...input, vehicle: { ...input.vehicle, available: false } }),
    false
  )
})

test('new configuration cannot rewrite a previously created price and itinerary snapshot', async (t) => {
  const fixture = setup(t)
  const original = await createCustomerTourBooking(baseInput, fixture.client)
  assert.ok(original.ok)
  const before = structuredClone(original.dto)
  t.mock.method(fixture.client.tourCommercialRate, 'findUnique', async () => ({
    id: 'sedan',
    active: true,
    priceMinor: 15_000_000,
  }))
  fixture.tours[0].itineraryDays[0].stops[0].title = 'New configured stop'
  const next = await createCustomerTourBooking(baseInput, fixture.client)
  assert.ok(next.ok)
  assert.equal(next.dto.price.value, 450_000)
  assert.equal(next.dto.days[0].stops[0].title, 'New configured stop')
  assert.deepEqual(original.dto, before)
})

test('canonical catalogue and checkout readiness reject multi-day and addon-only products', (t) => {
  const fixture = setup(t)
  const tour = fixture.tours[0]
  assert.equal(canonicalTourExecutionReadiness(tour).executionReady, true)
  assert.equal(
    canonicalTourExecutionReadiness({
      ...tour,
      itineraryDays: [tour.itineraryDays[0], tour.itineraryDays[0]],
    }).reason,
    'invalid_canonical_day_count'
  )
  assert.equal(
    canonicalTourExecutionReadiness({
      ...tour,
      itineraryDays: [
        {
          ...tour.itineraryDays[0],
          stops: tour.itineraryDays[0].stops.filter((stop) => stop.addonCode),
        },
      ],
    }).executionReady,
    false
  )
})
