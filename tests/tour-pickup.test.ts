import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { prisma } from '../src/lib/prisma'
import { tourPickupSchema, type TourPickup } from '../src/lib/mobile/tourPickup'
import { createCustomerTourBooking, getCustomerTourBooking } from '../src/lib/mobile/tourBookings'
import { assignTourBookingDay, getDriverTourDay } from '../src/lib/mobile/tourExecution'
import {
  getCustomerTourTracking,
  getOrRefreshTourJourneyIntelligence,
} from '../src/lib/mobile/tourTracking'
import { findAdminTourItinerary, saveAdminTourItinerary } from '../src/lib/admin/tourItinerary'
import { adminRoleCan } from '../src/lib/roles'
import { CANONICAL_TOUR_IDS } from '../src/lib/tourCommercial'
import {
  configureCommercialTours,
  cotonouGeocodingResponse,
} from './helpers/tourCommercialDatabase'

// Synthetic fixtures only; these are not real hotel coordinates.
const hotelA: TourPickup = {
  label: 'Hotel A',
  address: 'Fixture address A',
  coordinates: { latitude: 1, longitude: 2 },
}
const hotelC: TourPickup = {
  label: 'Hotel C',
  address: 'Fixture address C',
  coordinates: { latitude: 3, longitude: 4 },
}
const url = process.env.TOUR_ITINERARY_TEST_DATABASE_URL

test('Tour pickup requires bounded finite coordinates and nonempty bounded label/address', async () => {
  for (const pickup of [
    undefined,
    null,
    {},
    { label: 'My hotel' },
    { ...hotelA, coordinates: {} },
    { ...hotelA, label: ' ' },
    { ...hotelA, address: ' ' },
    { ...hotelA, label: 'x'.repeat(161) },
    { ...hotelA, address: 'x'.repeat(301) },
    ...[undefined, null, '1', NaN, Infinity, -Infinity, -91, 91].map((latitude) => ({
      ...hotelA,
      coordinates: { latitude, longitude: 2 },
    })),
    ...[undefined, null, '2', NaN, Infinity, -Infinity, -181, 181].map((longitude) => ({
      ...hotelA,
      coordinates: { latitude: 1, longitude },
    })),
  ]) {
    assert.equal(tourPickupSchema.safeParse(pickup).success, false)
    const result = await createCustomerTourBooking({
      principal: {
        type: 'CUSTOMER',
        userId: 'unused',
        role: 'user',
        email: '',
        sessionId: 'test',
      },
      tourId: 'unused',
      startDate: '2099-01-01',
      travellers: 1,
      pickup: pickup as TourPickup,
    })
    assert.deepEqual(result, { ok: false, code: 'VALIDATION_ERROR' })
  }
  assert.deepEqual(
    tourPickupSchema.parse({
      ...hotelA,
      label: ' Hotel A ',
      address: ' Fixture address A ',
    }),
    hotelA
  )
  assert.equal(
    tourPickupSchema.safeParse({
      ...hotelA,
      coordinates: { latitude: 0, longitude: 0 },
    }).success,
    true
  )
})

test('day pickup override retains the existing tours permission boundary', () => {
  const source = readFileSync('src/app/api/admin/tour-bookings/days/[dayId]/route.ts', 'utf8')
  assert.ok(source.indexOf("requireAdminPermission('tours')") < source.indexOf('await req.json()'))
  assert.ok(source.includes('if (!guard.ok) return guard.response'))
  for (const role of ['user', 'driver', 'finance_admin', 'support_admin'])
    assert.equal(adminRoleCan(role, 'tours'), false)
  assert.equal(adminRoleCan('operations_admin', 'tours'), true)
})

test(
  'Tour customer pickup PostgreSQL snapshots, overrides, authorization and journey cache',
  { skip: !url, timeout: 60000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.ok(/^\/beninfy_(dispatch|tour)_test/.test(target.pathname))
    const id = 'pickup-test-' + randomUUID()
    const user = await prisma.user.create({ data: { name: 'Pickup fixture' } })
    const other = await prisma.user.create({
      data: { name: 'Other pickup fixture' },
    })
    const driver = await prisma.driver.create({
      data: { name: 'Pickup driver fixture', phone: 'fixture' },
    })
    const principal = {
      type: 'CUSTOMER' as const,
      userId: user.id,
      role: 'user',
      email: '',
      sessionId: 'test',
    }
    const driverPrincipal = {
      ...principal,
      type: 'DRIVER' as const,
      driverId: driver.id,
    }
    const startDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    const originalKey = process.env.GOOGLE_ROUTES_API_KEY
    const originalPlacesKey = process.env.GOOGLE_PLACES_API_KEY
    process.env.GOOGLE_PLACES_API_KEY = 'fixture-only-key'
    process.env.GOOGLE_ROUTES_API_KEY = 'fixture-only-key'
    const routeResponse = () =>
      Response.json({
        routes: [
          {
            distanceMeters: 1000,
            duration: '120s',
            polyline: { encodedPolyline: 'fixture-route' },
          },
        ],
      })
    const requests: Array<{
      destination: { location: { latLng: TourPickup['coordinates'] } }
    }> = []
    const fetchMock = t.mock.method(
      globalThis,
      'fetch',
      async (_url: unknown, init?: RequestInit) => {
        if (!init?.body) return cotonouGeocodingResponse()
        requests.push(JSON.parse(String(init?.body)))
        return routeResponse()
      }
    )
    await prisma.tour.create({
      data: {
        id,
        title: 'Pickup fixture',
        country: 'Test',
        durationDays: 3,
        startingFromNGN: 0,
        description: 'Test only',
      },
    })
    const days = [1, 2, 3].map((dayNumber) => ({
      dayNumber,
      title: 'Fixture day ' + dayNumber,
      defaultStartLabel: 'Meeting Point B',
      defaultStartAddress: 'Fixture B',
      defaultStartLatitude: 5,
      defaultStartLongitude: 6,
      stops: [
        {
          sortOrder: 1,
          title: 'Fixture stop',
          address: 'Fixture stop address',
          latitude: 7,
          longitude: 8,
        },
      ],
    }))
    try {
      assert.equal((await saveAdminTourItinerary(id, { days })).ok, true)
      await configureCommercialTours(days)
      const templateBefore = await findAdminTourItinerary(id)
      const input = {
        principal,
        tourId: CANONICAL_TOUR_IDS[0],
        tourIds: [...CANONICAL_TOUR_IDS],
        vehicleCategoryId: 'tour-test-sedan',
        startDate,
        travellers: 3,
        pickup: hotelA,
        idempotencyKey: 'pickup-' + randomUUID(),
      }
      const created = await createCustomerTourBooking(input)
      assert.ok(created.ok)
      const bookingId = created.booking.id
      const day2 = created.booking.days[1].id
      // Settlement is not under test here; tracking requires a confirmed booking.
      await prisma.tourBooking.update({
        where: { id: bookingId },
        data: {
          status: 'confirmed',
          paymentStatus: 'paid',
          amountPaidNGN: created.booking.priceNGN,
        },
      })
      const detail = () => getCustomerTourBooking({ principal, tourBookingId: bookingId })
      await t.test(
        'Hotel A is stored on the booking and all three days; template Meeting Point B is untouched',
        async () => {
          assert.deepEqual(created.dto.pickup, hotelA)
          assert.equal(created.booking.pickupLabel, hotelA.label)
          assert.equal(created.booking.pickupLatitude, 1)
          assert.deepEqual(
            created.dto.days.map((day) => day.pickup),
            [hotelA, hotelA, hotelA]
          )
          assert.deepEqual(await findAdminTourItinerary(id), templateBefore)
        }
      )
      await t.test(
        'same key replays the original pickup despite serialization or payload changes; new intent uses a new key',
        async () => {
          for (const pickup of [
            {
              address: ' Fixture address A ',
              coordinates: { longitude: 2.0, latitude: 1.0 },
              label: ' Hotel A ',
            },
            hotelC,
          ]) {
            const retry = await createCustomerTourBooking({ ...input, pickup })
            assert.ok(retry.ok)
            assert.equal(retry.booking.id, bookingId)
            assert.deepEqual(retry.dto.pickup, hotelA)
            assert.equal('idempotent' in retry && retry.idempotent, true)
          }
          assert.equal(await prisma.tourBooking.count({ where: { userId: user.id } }), 1)
          const fresh = await createCustomerTourBooking({
            ...input,
            pickup: hotelC,
            idempotencyKey: 'pickup-' + randomUUID(),
          })
          assert.ok(fresh.ok)
          assert.notEqual(fresh.booking.id, bookingId)
          assert.deepEqual(fresh.dto.pickup, hotelC)
        }
      )
      await t.test(
        'concurrent retries with one key create exactly one pickup snapshot',
        async () => {
          const key = 'pickup-' + randomUUID()
          const results = await Promise.all([
            createCustomerTourBooking({ ...input, idempotencyKey: key }),
            createCustomerTourBooking({ ...input, idempotencyKey: key }),
          ])
          assert.ok(results[0].ok && results[1].ok)
          assert.equal(results[0].booking.id, results[1].booking.id)
          assert.deepEqual(results[0].dto.pickup, hotelA)
          assert.deepEqual(results[1].dto.pickup, hotelA)
          assert.equal(
            await prisma.tourBooking.count({
              where: { userId: user.id, idempotencyKey: key },
            }),
            1
          )
        }
      )
      await t.test(
        'pickup override changes only Day 2 and preserves booking pickup, other days, template and assignment state',
        async () => {
          await prisma.tourBookingDay.update({
            where: { id: day2 },
            data: {
              status: 'driver_en_route',
              assignedDriverId: driver.id,
              acceptedAt: new Date(),
            },
          })
          const before = await prisma.tourBookingDay.findUniqueOrThrow({
            where: { id: day2 },
          })
          const result = await assignTourBookingDay({
            tourBookingDayId: day2,
            pickup: hotelC,
          })
          assert.ok(result.ok)
          assert.equal(result.day.status, before.status)
          assert.equal(result.day.assignedDriverId, before.assignedDriverId)
          assert.deepEqual(result.day.acceptedAt, before.acceptedAt)
          const current = await detail()
          assert.ok(current.ok)
          assert.deepEqual(current.dto.pickup, hotelA)
          assert.deepEqual(
            current.dto.days.map((day) => day.pickup),
            [hotelA, hotelC, hotelA]
          )
          assert.deepEqual(await findAdminTourItinerary(id), templateBefore)
        }
      )
      await t.test(
        'Driver detail and Customer tracking target the overridden day pickup with unchanged ownership boundaries',
        async () => {
          const assigned = await getDriverTourDay(driverPrincipal, day2)
          assert.ok(assigned.ok)
          assert.deepEqual(assigned.dto.day.pickup, hotelC)
          const tracking = await getCustomerTourTracking({
            principal,
            tourBookingId: bookingId,
          })
          assert.ok(tracking.ok)
          assert.deepEqual(tracking.dto.currentDay.pickup, hotelC)
          assert.deepEqual(tracking.dto.routeTarget?.coordinates, hotelC.coordinates)
          const outsider = { ...principal, userId: other.id }
          assert.deepEqual(
            await getCustomerTourBooking({
              principal: outsider,
              tourBookingId: bookingId,
            }),
            { ok: false, code: 'TOUR_BOOKING_NOT_FOUND' }
          )
          assert.deepEqual(
            await getCustomerTourTracking({
              principal: outsider,
              tourBookingId: bookingId,
            }),
            { ok: false, code: 'TOUR_BOOKING_NOT_FOUND' }
          )
          assert.deepEqual(
            await getDriverTourDay({ ...driverPrincipal, driverId: 'other-driver' }, day2),
            { ok: false, code: 'TOUR_DAY_NOT_ASSIGNED' }
          )
        }
      )
      await t.test(
        'pre-pickup overrides invalidate the cached route and refresh towards the new coordinates',
        async () => {
          const now = new Date()
          await prisma.latestTourLocation.create({
            data: {
              tourBookingDayId: day2,
              driverId: driver.id,
              latitude: 0,
              longitude: 0,
              capturedAt: now,
              expiresAt: new Date(Date.now() + 600000),
            },
          })
          const cached = await getOrRefreshTourJourneyIntelligence({
            tourBookingDayId: day2,
          })
          assert.equal(cached?.destinationLatitude, 3)
          assert.equal(
            (
              await assignTourBookingDay({
                tourBookingDayId: day2,
                pickup: hotelA,
              })
            ).ok,
            true
          )
          assert.equal(
            await prisma.tourJourneySnapshot.findUnique({
              where: { tourBookingDayId: day2 },
            }),
            null
          )
          const refreshed = await getOrRefreshTourJourneyIntelligence({
            tourBookingDayId: day2,
          })
          assert.equal(refreshed?.destinationLatitude, 1)
          assert.deepEqual(requests.at(-1)?.destination.location.latLng, hotelA.coordinates)
        }
      )
      await t.test(
        'a cached pickup route with different coordinates is never used on provider failure',
        async () => {
          await prisma.tourJourneySnapshot.update({
            where: { tourBookingDayId: day2 },
            data: { destinationLatitude: 9 },
          })
          fetchMock.mock.mockImplementationOnce(async () => new Response('', { status: 503 }))
          assert.equal(
            await getOrRefreshTourJourneyIntelligence({
              tourBookingDayId: day2,
            }),
            null
          )
        }
      )
      await t.test(
        'an in-flight route for the old pickup cannot repopulate the cache after an override',
        async () => {
          await prisma.tourJourneySnapshot.deleteMany({
            where: { tourBookingDayId: day2 },
          })
          let release!: () => void
          let started!: () => void
          const gate = new Promise<void>((resolve) => {
            release = resolve
          })
          const entered = new Promise<void>((resolve) => {
            started = resolve
          })
          fetchMock.mock.mockImplementationOnce(async () => {
            started()
            await gate
            return routeResponse()
          })
          const pending = getOrRefreshTourJourneyIntelligence({
            tourBookingDayId: day2,
          })
          await entered
          try {
            assert.equal(
              (
                await assignTourBookingDay({
                  tourBookingDayId: day2,
                  pickup: hotelC,
                })
              ).ok,
              true
            )
          } finally {
            release()
          }
          assert.equal(await pending, null)
          assert.equal(
            await prisma.tourJourneySnapshot.findUnique({
              where: { tourBookingDayId: day2 },
            }),
            null
          )
        }
      )
      await t.test(
        'waiting-driver pickup edits are allowed; started and terminal day edits are rejected without partial changes',
        async () => {
          await prisma.tourBookingDay.update({
            where: { id: day2 },
            data: { status: 'driver_arrived' },
          })
          assert.equal(
            (
              await assignTourBookingDay({
                tourBookingDayId: day2,
                pickup: hotelA,
              })
            ).ok,
            true
          )
          // Assignment restrictions remain unchanged, including mixed assignment/pickup requests.
          assert.deepEqual(
            await assignTourBookingDay({
              tourBookingDayId: day2,
              driverId: driver.id,
              pickup: hotelC,
            }),
            { ok: false, code: 'TOUR_ACTION_NOT_ALLOWED' }
          )
          assert.deepEqual(
            await assignTourBookingDay({
              tourBookingDayId: day2,
              pickup: {
                ...hotelC,
                coordinates: { latitude: NaN, longitude: 4 },
              },
            }),
            { ok: false, code: 'VALIDATION_ERROR' }
          )
          for (const status of ['in_progress', 'completed', 'cancelled']) {
            await prisma.tourBookingDay.update({
              where: { id: day2 },
              data: { status },
            })
            assert.deepEqual(
              await assignTourBookingDay({
                tourBookingDayId: day2,
                pickup: hotelC,
              }),
              { ok: false, code: 'TOUR_ACTION_NOT_ALLOWED' }
            )
            assert.equal(
              (
                await prisma.tourBookingDay.findUniqueOrThrow({
                  where: { id: day2 },
                })
              ).pickupLabel,
              hotelA.label
            )
          }
          await prisma.tourBookingDay.update({
            where: { id: day2 },
            data: { status: 'driver_en_route' },
          })
        }
      )
      await t.test(
        'template edits and absence of defaultStart do not change booked pickups or template readiness',
        async () => {
          const before = await detail()
          const edited = await saveAdminTourItinerary(id, {
            days: days.map((day) => ({
              ...day,
              title: day.title + ' edited',
              defaultStartLabel: null,
              defaultStartAddress: null,
              defaultStartLatitude: null,
              defaultStartLongitude: null,
            })),
          })
          assert.ok(edited.ok)
          assert.equal(edited.response.executionReady, true)
          assert.deepEqual(await detail(), before)
          const next = await createCustomerTourBooking({
            ...input,
            idempotencyKey: 'pickup-' + randomUUID(),
            pickup: hotelC,
          })
          assert.ok(next.ok)
          assert.deepEqual(
            next.dto.days.map((day) => day.pickup),
            [hotelC, hotelC, hotelC]
          )
        }
      )
      await t.test(
        'historical null booking pickup stays null while existing day pickups remain authoritative',
        async () => {
          await prisma.tourBooking.update({
            where: { id: bookingId },
            data: {
              pickupLabel: null,
              pickupAddress: null,
              pickupLatitude: null,
              pickupLongitude: null,
            },
          })
          const legacy = await detail()
          assert.ok(legacy.ok)
          assert.deepEqual(legacy.dto.pickup, {
            label: null,
            address: null,
            coordinates: null,
          })
          assert.deepEqual(legacy.dto.days[0].pickup, hotelA)
        }
      )
    } finally {
      fetchMock.mock.restore()
      if (originalKey === undefined) delete process.env.GOOGLE_ROUTES_API_KEY
      else process.env.GOOGLE_ROUTES_API_KEY = originalKey
      if (originalPlacesKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY
      else process.env.GOOGLE_PLACES_API_KEY = originalPlacesKey
      await prisma.tourBooking.deleteMany({ where: { tourId: id } })
      await prisma.tour.delete({ where: { id } })
      await prisma.driver.delete({ where: { id: driver.id } })
      await prisma.user.deleteMany({
        where: { id: { in: [user.id, other.id] } },
      })
      await prisma.$disconnect()
    }
  }
)
