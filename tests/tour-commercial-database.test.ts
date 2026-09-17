import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { CANONICAL_TOUR_IDS } from '../src/lib/tourCommercial'
import { createCustomerTourBooking } from '../src/lib/mobile/tourBookings'
import { initiateMobileTourBookingPayment } from '../src/lib/mobile/tourPayments'
import { approveTourOperationsQuote, archiveOrDeleteTour } from '../src/lib/admin/tourCommercial'
import { getPublicTours } from '../src/lib/tourCatalog'
import { configureCommercialTours, mockCotonouGeocoding } from './helpers/tourCommercialDatabase'

const url = process.env.TOUR_ITINERARY_TEST_DATABASE_URL

test(
  'Tour commercial PostgreSQL relations, snapshots, atomicity and quote approval',
  { skip: !url },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_(dispatch|tour)_test/)
    const fetchMock = mockCotonouGeocoding(t)
    const user = await prisma.user.create({ data: { name: 'Commercial DB fixture' } })
    const principal = {
      type: 'CUSTOMER' as const,
      userId: user.id,
      role: 'user',
      email: '',
      sessionId: 'test',
    }
    const days = CANONICAL_TOUR_IDS.map((title) => ({
      dayNumber: 1,
      title,
      defaultStartLabel: 'Synthetic pickup',
      defaultStartAddress: 'Synthetic address',
      defaultStartLatitude: 1,
      defaultStartLongitude: 2,
      stops: [
        {
          sortOrder: 1,
          title: 'Synthetic stop',
          address: 'Synthetic stop address',
          latitude: 3,
          longitude: 4,
        },
      ],
    }))
    const input = {
      principal,
      tourId: CANONICAL_TOUR_IDS[0],
      tourIds: [...CANONICAL_TOUR_IDS],
      vehicleCategoryId: 'tour-test-sedan',
      startDate: '2099-01-01',
      travellers: 3,
      pickup: {
        label: 'Synthetic pickup',
        address: 'Synthetic address',
        coordinates: { latitude: 1, longitude: 2 },
      },
    }
    try {
      await t.test(
        'migration copies configured source templates without altering legacy coordinates',
        async () => {
          const original = await prisma.tourItineraryStop.findUniqueOrThrow({
            where: { id: 'migration-template-stop' },
          })
          const copy = await prisma.tourItineraryStop.findUniqueOrThrow({
            where: { id: 'commercial-migration-template-stop' },
          })
          assert.equal(copy.latitude, original.latitude)
          assert.equal(copy.longitude, original.longitude)
          assert.equal(copy.title, original.title)
          assert.equal(
            await prisma.tourItineraryDay.count({ where: { tourId: 'benin-history-lake' } }),
            3
          )
          assert.equal(
            (await prisma.tour.findUniqueOrThrow({ where: { id: 'benin-history-lake' } })).active,
            false
          )
          assert.equal(
            await prisma.tourItineraryDay.count({
              where: { tourId: { in: [...CANONICAL_TOUR_IDS] } },
            }),
            3
          )
        }
      )
      await configureCommercialTours(days)
      await t.test(
        'migration preserves completed historical booking and backfills identity',
        async () => {
          const history = await prisma.tourBooking.findUniqueOrThrow({
            where: { id: 'migration-history-booking' },
            include: { tour: true, days: { include: { stops: true } } },
          })
          assert.equal(history.tour.active, false)
          assert.equal(history.status, 'completed')
          assert.equal(history.paymentStatus, 'paid')
          assert.equal(history.priceNGN, 123000)
          assert.equal(history.amountPaidNGN, 123000)
          assert.deepEqual(history.selectedTourIds, ['migration-history-tour'])
          assert.equal(history.days[0].sourceTourId, 'migration-history-tour')
          assert.equal(history.days[0].stops[0].id, 'migration-history-stop')
          assert.equal((await archiveOrDeleteTour(history.tourId)).archived, true)
          assert.equal(await prisma.tourBooking.count({ where: { id: history.id } }), 1)
          await assert.rejects(prisma.tour.delete({ where: { id: history.tourId } }))
        }
      )
      await t.test('all seeded rate rows exist, including unmapped Odyssey/GX460', async () => {
        const rates = await prisma.tourCommercialRate.findMany({ orderBy: { id: 'asc' } })
        assert.deepEqual(Object.fromEntries(rates.map((rate) => [rate.id, rate.priceMinor])), {
          gx460: 20000000,
          odyssey: 20000000,
          sedan: 10000000,
          sienna: 15000000,
          suv: 17500000,
        })
      })
      await t.test(
        'DB bookings pin all five rates, all selection counts and component-only Gogotinkpo',
        async () => {
          await prisma.tourItineraryStop.create({
            data: {
              itineraryDayId: (
                await prisma.tourItineraryDay.findFirstOrThrow({
                  where: { tourId: 'cotonou-city-tour' },
                })
              ).id,
              sortOrder: 2,
              title: 'Synthetic Gogotinkpo',
              addonCode: 'gogotinkpo',
              address: 'Synthetic address',
              latitude: 1,
              longitude: 2,
            },
          })
          for (const [category, base] of Object.entries({
            sedan: 100000,
            sienna: 150000,
            suv: 175000,
            odyssey: 200000,
            gx460: 200000,
          })) {
            await prisma.vehicle.update({
              where: { id: 'tour-test-sedan' },
              data: { tourPricingCategory: category },
            })
            for (const count of [1, 2, 3]) {
              const booked = await createCustomerTourBooking({
                ...input,
                tourIds: CANONICAL_TOUR_IDS.slice(0, count),
                travellers: count,
              })
              assert.ok(booked.ok)
              assert.equal(booked.booking.priceNGN, base * count)
              assert.equal(booked.booking.days.length, count)
              const addon = await createCustomerTourBooking({
                ...input,
                tourIds: CANONICAL_TOUR_IDS.slice(0, count),
                gogotinkpo: true,
              })
              assert.ok(addon.ok)
              assert.equal(addon.booking.priceNGN, base * count + base / 5)
              assert.equal(addon.booking.days[0].componentPriceMinor, base * 120)
              assert.ok(
                addon.booking.days.slice(1).every((day) => day.componentPriceMinor === base * 100)
              )
            }
          }
          await prisma.vehicle.update({
            where: { id: 'tour-test-sedan' },
            data: { tourPricingCategory: 'sedan' },
          })
        }
      )
      await t.test(
        'one booking/reference holds three canonically ordered Days and immutable pricing',
        async () => {
          const created = await createCustomerTourBooking({
            ...input,
            tourIds: [...CANONICAL_TOUR_IDS].reverse(),
          })
          assert.ok(created.ok)
          assert.equal(created.booking.days.length, 3)
          assert.deepEqual(
            created.booking.days.map((day) => day.sourceTourId),
            [...CANONICAL_TOUR_IDS]
          )
          assert.equal(created.booking.days[2].transportationOnly, true)
          assert.equal(created.booking.priceNGN, 300000)
          const before = await prisma.tourBooking.findUniqueOrThrow({
            where: { id: created.booking.id },
            include: { days: { include: { stops: true } } },
          })
          await prisma.tourCommercialRate.update({
            where: { id: 'sedan' },
            data: { priceMinor: 11000000 },
          })
          const next = await createCustomerTourBooking({ ...input, travellers: 1 })
          assert.ok(next.ok)
          assert.equal(next.booking.priceNGN, 330000)
          assert.deepEqual(
            await prisma.tourBooking.findUniqueOrThrow({
              where: { id: before.id },
              include: { days: { include: { stops: true } } },
            }),
            before
          )
          await prisma.tourCommercialRate.update({
            where: { id: 'sedan' },
            data: { priceMinor: 10000000 },
          })
          await assert.rejects(
            prisma.tourBookingDay.create({
              data: {
                tourBookingId: before.id,
                dayNumber: 1,
                scheduledDate: new Date('2099-01-01'),
                title: 'Duplicate',
              },
            })
          )
          await assert.rejects(
            prisma.tourCommercialRate.update({ where: { id: 'sedan' }, data: { priceMinor: 101 } })
          )
        }
      )
      await t.test(
        'concurrent same-key combined requests produce exactly one booking',
        async () => {
          const key = randomUUID()
          const results = await Promise.all([
            createCustomerTourBooking({ ...input, idempotencyKey: key }),
            createCustomerTourBooking({ ...input, idempotencyKey: key }),
          ])
          assert.ok(results[0].ok && results[1].ok)
          assert.equal(results[0].booking.id, results[1].booking.id)
          assert.equal(
            await prisma.tourBooking.count({ where: { userId: user.id, idempotencyKey: key } }),
            1
          )
        }
      )
      await t.test('a real nested DB failure rolls back the entire combined booking', async () => {
        const before = await prisma.tourBooking.count({ where: { userId: user.id } })
        const failing = prisma.$extends({
          query: {
            tour: {
              async findMany({ args, query }) {
                const products = await query(args)
                const last = products.find(
                  (product) => product.id === 'ganvie-tour'
                ) as unknown as { itineraryDays: Array<{ stops: Array<{ title: string }> }> }
                last.itineraryDays[0].stops[0].title = null as unknown as string
                return products
              },
            },
          },
        })
        await assert.rejects(createCustomerTourBooking(input, failing as unknown as typeof prisma))
        assert.equal(await prisma.tourBooking.count({ where: { userId: user.id } }), before)
      })
      await t.test(
        'custom quote cannot pay; concurrent approval freezes one authoritative quote',
        async () => {
          const created = await createCustomerTourBooking({
            ...input,
            itineraryMode: 'custom',
            customItinerary: 'Please review this custom execution plan.',
          })
          assert.ok(created.ok)
          assert.equal(created.booking.status, 'quote_pending')
          const blocked = await initiateMobileTourBookingPayment({
            principal,
            tourBookingId: created.booking.id,
            provider: 'paystack',
            locale: 'en',
            origin: 'https://example.test',
          })
          assert.deepEqual(blocked, { ok: false, code: 'TOUR_QUOTE_REQUIRED' })
          const payload = {
            expectedUpdatedAt: created.booking.updatedAt.toISOString(),
            priceNGN: 425000,
            days: days.map((day, index) => ({ ...day, dayNumber: index + 1 })),
          }
          const approvals = await Promise.all([
            approveTourOperationsQuote(created.booking.id, payload),
            approveTourOperationsQuote(created.booking.id, payload),
          ])
          assert.equal(approvals.filter((result) => result.ok).length, 1)
          assert.equal(approvals.find((result) => !result.ok)?.status, 409)
          const approved = await prisma.tourBooking.findUniqueOrThrow({
            where: { id: created.booking.id },
            include: { days: { orderBy: { dayNumber: 'asc' } } },
          })
          assert.equal(approved.quoteStatus, 'approved')
          assert.equal(approved.status, 'payment_pending')
          assert.equal(approved.priceNGN, 425000)
          assert.equal((approved.commercialSnapshot as Prisma.JsonObject).totalMinor, 42500000)
          assert.deepEqual(
            approved.days.map((day) => day.id),
            created.booking.days.map((day) => day.id)
          )
          assert.deepEqual(
            approved.days.map((day) => day.sourceTourId),
            [...CANONICAL_TOUR_IDS]
          )
          const repeated = await approveTourOperationsQuote(created.booking.id, {
            ...payload,
            expectedUpdatedAt: approved.updatedAt.toISOString(),
            priceNGN: 1,
          })
          assert.equal(repeated.ok, false)
          assert.equal(
            (await prisma.tourBooking.findUniqueOrThrow({ where: { id: approved.id } })).priceNGN,
            425000
          )
          const oldEnabled = process.env.PAYMENTS_ENABLED
          const oldSecret = process.env.PAYSTACK_SECRET_KEY
          process.env.PAYMENTS_ENABLED = 'true'
          process.env.PAYSTACK_SECRET_KEY = 'fixture-only-paystack-key'
          try {
            fetchMock.mock.mockImplementationOnce(async (_url: unknown, init?: RequestInit) => {
              const body = JSON.parse(String(init?.body))
              assert.equal(body.amount, 42500000)
              assert.equal(body.currency, 'NGN')
              return Response.json({
                status: true,
                data: {
                  authorization_url: 'https://checkout.example.test/fixture',
                  access_code: 'fixture-access',
                  reference: body.reference,
                },
              })
            })
            const payment = await initiateMobileTourBookingPayment({
              principal,
              tourBookingId: approved.id,
              provider: 'paystack',
              locale: 'en',
              origin: 'https://example.test',
            })
            assert.ok(payment.ok)
            assert.equal(payment.dto.amount.minorValue, 42500000)
            assert.equal(payment.dto.checkout?.accessCode, 'fixture-access')
            assert.equal(payment.payment?.amountNGN, 425000)
            assert.ok(!JSON.stringify(payment.dto).includes('fixture-only-paystack-key'))
          } finally {
            if (oldEnabled === undefined) delete process.env.PAYMENTS_ENABLED
            else process.env.PAYMENTS_ENABLED = oldEnabled
            if (oldSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY
            else process.env.PAYSTACK_SECRET_KEY = oldSecret
          }
        }
      )
      await t.test(
        'archive removes discovery without deleting referenced products; unused legacy may delete',
        async () => {
          assert.equal((await archiveOrDeleteTour('ouidah-tour')).archived, true)
          assert.ok(!(await getPublicTours()).some((tour) => tour.id === 'ouidah-tour'))
          const rejected = await createCustomerTourBooking(input)
          assert.ok(!rejected.ok)
          await prisma.tour.update({ where: { id: 'ouidah-tour' }, data: { active: true } })
          const unused = await prisma.tour.create({
            data: {
              id: randomUUID(),
              title: 'Obsolete unused',
              country: 'Test',
              durationDays: 1,
              startingFromNGN: 1,
              description: 'Fixture',
            },
          })
          assert.equal((await archiveOrDeleteTour(unused.id)).archived, false)
          assert.equal(await prisma.tour.findUnique({ where: { id: unused.id } }), null)
          assert.deepEqual(
            (await getPublicTours()).map((tour) => tour.id),
            [...CANONICAL_TOUR_IDS]
          )
        }
      )
    } finally {
      await prisma.payment.deleteMany({ where: { tourBooking: { userId: user.id } } })
      await prisma.tourBooking.deleteMany({ where: { userId: user.id } })
      await prisma.user.delete({ where: { id: user.id } })
      await prisma.$disconnect()
    }
  }
)
