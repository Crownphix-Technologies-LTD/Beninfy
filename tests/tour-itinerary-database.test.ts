import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import {
  adminTourItineraryResponse,
  findAdminTourItinerary,
  saveAdminTourItinerary,
} from '../src/lib/admin/tourItinerary'
import { createCustomerTourBooking } from '../src/lib/mobile/tourBookings'
import { CANONICAL_TOUR_IDS } from '../src/lib/tourCommercial'
import { configureCommercialTours, mockCotonouGeocoding } from './helpers/tourCommercialDatabase'

const url = process.env.TOUR_ITINERARY_TEST_DATABASE_URL

test(
  'Tour itinerary PostgreSQL save, reload and booking snapshot isolation',
  { skip: !url },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.ok(/^\/beninfy_(dispatch|tour)_test/.test(target.pathname))
    mockCotonouGeocoding(t)
    const id = 'itinerary-test-' + randomUUID()
    const user = await prisma.user.create({ data: { name: 'Itinerary fixture customer' } })
    await prisma.tour.create({
      data: {
        id,
        title: 'Synthetic test package',
        country: 'Test',
        durationDays: 3,
        startingFromNGN: 120000,
        description: 'Test only',
      },
    })
    const days = [3, 1, 2].map((dayNumber) => ({
      dayNumber,
      title: 'Fixture day ' + dayNumber,
      titleFr: 'Fixture FR ' + dayNumber,
      defaultStartLabel: 'Fixture pickup',
      defaultStartAddress: 'Test address',
      defaultStartLatitude: 0,
      defaultStartLongitude: 0,
      stops: [2, 1].map((sortOrder) => ({
        sortOrder,
        title: 'Fixture stop ' + sortOrder,
        address: 'Test address',
        latitude: 1,
        longitude: 1,
        estimatedDurationMinutes: 45,
        required: true,
      })),
    }))
    try {
      await t.test(
        'empty template and days with no stops return backend not-ready reasons',
        async () => {
          const empty = await saveAdminTourItinerary(id, { days: [] })
          assert.equal(empty.ok, true)
          if (empty.ok) assert.equal(empty.response.executionReadinessReason, 'no_itinerary_days')
          const missing = await saveAdminTourItinerary(id, {
            days: [{ dayNumber: 1, title: 'Fixture', stops: [] }],
          })
          assert.equal(missing.ok, true)
          if (missing.ok)
            assert.equal(missing.response.executionReadinessReason, 'missing_day_stop')
        }
      )
      await t.test(
        'three days save/reload in authoritative day and stop order and become ready',
        async () => {
          const result = await saveAdminTourItinerary(id, { days })
          assert.equal(result.ok, true)
          if (!result.ok) return
          assert.equal(result.response.executionReady, true)
          assert.deepEqual(
            result.response.itineraryDays.map((day) => day.dayNumber),
            [1, 2, 3]
          )
          assert.deepEqual(
            result.response.itineraryDays[0].stops.map((stop) => stop.sortOrder),
            [1, 2]
          )
          const reload = await findAdminTourItinerary(id)
          assert.ok(reload)
          assert.deepEqual(adminTourItineraryResponse(reload), result.response)
          assert.equal(reload.startingFromNGN, 120000)
          assert.equal(reload.itineraryDays[0].defaultEndLatitude, null)
        }
      )
      await t.test('invalid payloads do not partially replace a configured itinerary', async () => {
        const before = await findAdminTourItinerary(id)
        for (const payload of [
          { days: [{ dayNumber: 1, title: '', stops: [] }] },
          { days: [{ ...days[0], stops: [{ ...days[0].stops[0], latitude: null }] }] },
          { days: [{ ...days[0], stops: [{ ...days[0].stops[0], longitude: 181 }] }] },
          { days: [days[0], days[0]] },
          { days: [{ ...days[0], defaultStartLongitude: null }] },
        ]) {
          const result = await saveAdminTourItinerary(id, payload)
          assert.equal(result.ok, false)
          if (!result.ok) assert.equal(result.status, 400)
          assert.deepEqual(await findAdminTourItinerary(id), before)
        }
      })
      await t.test(
        'stale editor saves fail with 409 and preserve the newer saved template',
        async () => {
          const before = await findAdminTourItinerary(id)
          assert.ok(before)
          const revision = before.updatedAt.toISOString()
          const first = await saveAdminTourItinerary(id, { days, expectedUpdatedAt: revision })
          assert.equal(first.ok, true)
          if (!first.ok) return
          assert.notEqual(first.response.updatedAt, revision)
          const second = await saveAdminTourItinerary(id, { days: [], expectedUpdatedAt: revision })
          assert.equal(second.ok, false)
          if (!second.ok) assert.equal(second.status, 409)
          assert.deepEqual(
            adminTourItineraryResponse((await findAdminTourItinerary(id))!),
            first.response
          )
        }
      )
      await t.test('concurrent editors cannot silently overwrite one another', async () => {
        const before = await findAdminTourItinerary(id)
        assert.ok(before)
        const expectedUpdatedAt = before.updatedAt.toISOString()
        const results = await Promise.all([
          saveAdminTourItinerary(id, { days, expectedUpdatedAt }),
          saveAdminTourItinerary(id, { days: [], expectedUpdatedAt }),
        ])
        assert.equal(results.filter((result) => result.ok).length, 1)
        const rejected = results.find((result) => !result.ok)
        assert.ok(rejected && !rejected.ok)
        assert.equal(rejected.status, 409)
        // Restore the complete fixture for the booking snapshot check below.
        assert.equal((await saveAdminTourItinerary(id, { days })).ok, true)
      })
      await t.test(
        'editing the template preserves existing booking snapshots; new bookings receive the changed plan',
        async () => {
          const principal = {
            type: 'CUSTOMER' as const,
            userId: user.id,
            role: 'user',
            email: '',
            sessionId: 'test',
          }
          const startDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
          await configureCommercialTours([...days].sort((a, b) => a.dayNumber - b.dayNumber))
          const original = await createCustomerTourBooking({
            principal,
            tourId: CANONICAL_TOUR_IDS[0],
            tourIds: [...CANONICAL_TOUR_IDS],
            vehicleCategoryId: 'tour-test-sedan',
            startDate,
            pickup: {
              label: 'Customer hotel',
              address: 'Synthetic address',
              coordinates: { latitude: 2, longitude: 3 },
            },
            travellers: 3,
          })
          assert.equal(original.ok, true)
          if (!original.ok) return
          const query = {
            where: { id: original.booking.id },
            include: {
              days: {
                orderBy: { dayNumber: 'asc' as const },
                include: { stops: { orderBy: { sortOrder: 'asc' as const } } },
              },
            },
          }
          const snapshotBefore = await prisma.tourBooking.findUniqueOrThrow(query)
          const edited = days.map((day) => ({
            ...day,
            title: day.title + ' updated',
            defaultStartLabel: 'New fixture pickup',
            stops: [...day.stops].reverse().map((stop, index) => ({
              ...stop,
              sortOrder: index + 1,
              title: stop.title + ' updated',
            })),
          }))
          const result = await saveAdminTourItinerary(id, { days: edited })
          assert.equal(result.ok, true)
          assert.deepEqual(await prisma.tourBooking.findUniqueOrThrow(query), snapshotBefore)
          await configureCommercialTours([...edited].sort((a, b) => a.dayNumber - b.dayNumber))
          const next = await createCustomerTourBooking({
            principal,
            tourId: CANONICAL_TOUR_IDS[0],
            tourIds: [...CANONICAL_TOUR_IDS],
            vehicleCategoryId: 'tour-test-sedan',
            startDate,
            pickup: {
              label: 'Customer hotel',
              address: 'Synthetic address',
              coordinates: { latitude: 2, longitude: 3 },
            },
            travellers: 5,
          })
          assert.equal(next.ok, true)
          if (!next.ok) return
          assert.match(next.booking.days[0].title, /updated/)
          assert.equal(next.booking.days[0].pickupLabel, 'Customer hotel')
          assert.notEqual(
            next.booking.days[0].sourceItineraryDayId,
            original.booking.days[0].sourceItineraryDayId
          )
          assert.equal(original.booking.priceNGN, 300000)
          assert.equal(next.booking.priceNGN, 300000)
          assert.equal(next.booking.days[0].stops[0].title, 'Fixture stop 1 updated')
        }
      )
    } finally {
      await prisma.tourBooking.deleteMany({ where: { tourId: id } })
      await prisma.tour.delete({ where: { id } })
      await prisma.user.delete({ where: { id: user.id } })
      await prisma.$disconnect()
    }
  }
)
