import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { getCustomerTourFeedback, submitCustomerTourFeedback } from '../src/lib/mobile/tourFeedback'
import { listAdminTourFeedback } from '../src/lib/admin/tourFeedback'
import { anonymizeDueCustomerAccounts } from '../src/lib/mobile/customerProduct'
import { issueMobileTokens, type MobilePrincipal } from '../src/lib/mobile/auth'
import {
  GET,
  POST,
} from '../src/app/api/mobile/v1/customer/tour-bookings/[tourBookingId]/feedback/route'

const positive = {
  professionalRespectful: true,
  feltSafe: true,
  followedAgreedService: 'yes',
  uncomfortablePersonalQuestions: false,
  offPlatformSolicitation: false,
  unauthorizedPaymentRequest: false,
}
const url = process.env.TOUR_ITINERARY_TEST_DATABASE_URL
test(
  'Tour feedback PostgreSQL eligibility, attribution, constraints, API and retention',
  { skip: !url },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_(dispatch|tour)_test/)
    const prefix = randomUUID()
    const users = await Promise.all(
      [1, 2].map((i) =>
        prisma.user.create({
          data: {
            name: 'Feedback fixture customer',
            email: `${prefix}-${i}@example.test`,
            phone: '+2290100000000',
            emailVerified: new Date(),
          },
        })
      )
    )
    const drivers = await Promise.all(
      [1, 2].map((i) =>
        prisma.driver.create({
          data: { name: 'Feedback fixture Driver ' + i, phone: 'fixture-only' },
        })
      )
    )
    const principals = users.map(
      (u) =>
        ({
          type: 'CUSTOMER',
          role: 'user',
          userId: u.id,
          email: u.email!,
          sessionId: 'fixture',
        }) satisfies MobilePrincipal
    )
    const bookingIds: string[] = []
    const create = async (status = 'completed', multiple = false, paymentStatus = 'paid') => {
      const booking = await prisma.tourBooking.create({
        data: {
          userId: users[0].id,
          tourId: 'cotonou-city-tour',
          reference: 'FEEDBACK-' + randomUUID(),
          tourTitle: 'Fixture combined Tours',
          tourCountry: 'Benin',
          priceNGN: 300000,
          subtotalNGN: 300000,
          startDate: new Date('2030-01-01'),
          endDate: new Date('2030-01-03'),
          travellers: 3,
          selectedTourIds: ['cotonou-city-tour', 'ouidah-tour', 'ganvie-tour'],
          status,
          paymentStatus,
          completedAt: status === 'completed' ? new Date() : null,
          days: {
            create: [1, 2, 3].map((dayNumber) => ({
              dayNumber,
              scheduledDate: new Date(`2030-01-0${dayNumber}`),
              title: 'Fixture Day ' + dayNumber,
              sourceTourId: ['cotonou-city-tour', 'ouidah-tour', 'ganvie-tour'][dayNumber - 1],
              sourceTourTitle: 'Fixture source Tour ' + dayNumber,
              status: status === 'completed' ? 'completed' : 'upcoming',
              assignedDriverId: drivers[multiple && dayNumber === 3 ? 1 : 0].id,
            })),
          },
        },
      })
      bookingIds.push(booking.id)
      return booking
    }
    const get = (id: string, user = 0) =>
      getCustomerTourFeedback({ tourBookingId: id, principal: principals[user] })
    const submit = (id: string, body: unknown, user = 0) =>
      submitCustomerTourFeedback({ tourBookingId: id, body, principal: principals[user] })
    const bodyFor = async (id: string, answers = positive) => {
      const result = await get(id)
      assert.ok(result.ok)
      return {
        overallRating: 5,
        comment: 'Fixture only',
        drivers: result.feedback.drivers.map((d) => ({ targetId: d.targetId, ...answers })),
      }
    }
    const oldSecret = process.env.MOBILE_AUTH_SECRET
    process.env.MOBILE_AUTH_SECRET = 'fixture-only-mobile-auth-secret-not-for-live-use'
    try {
      await t.test(
        'completed owned Tours eligible; other owner, active, cancelled and unpaid rejected',
        async () => {
          const owned = await create()
          const result = await get(owned.id)
          assert.ok(result.ok)
          assert.equal(result.feedback.eligible, true)
          assert.equal(result.feedback.drivers.length, 1)
          assert.equal(result.feedback.drivers[0].days.length, 3)
          assert.deepEqual(await get(owned.id, 1), { ok: false, code: 'TOUR_BOOKING_NOT_FOUND' })
          assert.deepEqual(await submit(owned.id, await bodyFor(owned.id), 1), {
            ok: false,
            code: 'TOUR_BOOKING_NOT_FOUND',
          })
          for (const status of ['active', 'confirmed', 'payment_pending', 'cancelled']) {
            const b = await create(status)
            const state = await get(b.id)
            assert.ok(state.ok)
            assert.equal(state.feedback.eligible, false)
            assert.deepEqual(await submit(b.id, { overallRating: 5, drivers: [] }), {
              ok: false,
              code: 'TOUR_FEEDBACK_NOT_ALLOWED',
            })
          }
          const unpaid = await create('completed', false, 'pending')
          const state = await get(unpaid.id)
          assert.ok(state.ok)
          assert.equal(state.feedback.eligible, false)
        }
      )
      await t.test(
        'multiple Drivers correctly attributed; forged, missing and duplicate targets rejected',
        async () => {
          const b = await create('completed', true)
          const state = await get(b.id)
          assert.ok(state.ok)
          assert.deepEqual(
            state.feedback.drivers.map((d) => d.days.length),
            [2, 1]
          )
          const body = await bodyFor(b.id)
          for (const invalid of [
            {
              ...body,
              drivers: [{ ...body.drivers[0], targetId: 'f'.repeat(32) }, body.drivers[1]],
            },
            { ...body, drivers: [body.drivers[0]] },
            { ...body, drivers: [body.drivers[0], body.drivers[0]] },
          ])
            assert.deepEqual(await submit(b.id, invalid), {
              ok: false,
              code: 'TOUR_FEEDBACK_TARGET_INVALID',
            })
          const result = await submit(b.id, {
            ...body,
            drivers: [
              body.drivers[0],
              {
                ...body.drivers[1],
                feltSafe: false,
                offPlatformSolicitation: true,
                unauthorizedPaymentRequest: true,
                professionalRespectful: false,
                followedAgreedService: 'no',
              },
            ],
          })
          assert.ok(result.ok)
          const saved = await prisma.tourFeedback.findUniqueOrThrow({
            where: { tourBookingId: b.id },
            include: { drivers: { include: { days: true } } },
          })
          assert.equal(saved.drivers.length, 2)
          const flagged = saved.drivers.find((d) => d.driverId === drivers[1].id)!
          assert.equal(flagged.days.length, 1)
          assert.equal(flagged.days[0].dayNumber, 3)
          assert.equal(flagged.days[0].sourceTourId, 'ganvie-tour')
          assert.deepEqual(
            saved.riskFlags.sort(),
            [
              'safety_concern',
              'off_platform_solicitation',
              'unauthorized_payment_request',
              'professionalism_concern',
              'service_itinerary_concern',
            ].sort()
          )
          assert.equal(
            (await prisma.driver.findUniqueOrThrow({ where: { id: drivers[1].id } })).status,
            'available'
          )
          const current = await get(b.id)
          assert.ok(current.ok)
          assert.equal(current.feedback.submitted, true)
          assert.equal(current.feedback.eligible, false)
          assert.ok(!JSON.stringify(current.feedback).includes('riskFlags'))
          await prisma.driver.update({
            where: { id: drivers[1].id },
            data: { name: 'Renamed fixture' },
          })
          assert.equal(
            (await prisma.tourDriverFeedback.findUniqueOrThrow({ where: { id: flagged.id } }))
              .driverName,
            'Feedback fixture Driver 2'
          )
          const reports = await listAdminTourFeedback({ page: 1, pageSize: 50, flagged: true })
          assert.ok(reports.feedback.some((f) => f.id === saved.id))
          assert.ok(reports.feedback.every((f) => f.reviewRequired))
          assert.ok(
            !(await listAdminTourFeedback({ page: 1, pageSize: 50, flagged: false })).feedback.some(
              (f) => f.id === saved.id
            )
          )
        }
      )
      await t.test(
        'positive feedback has no flags and concurrent duplicate submission creates one report',
        async () => {
          const b = await create()
          const body = await bodyFor(b.id)
          const responses = await Promise.all([submit(b.id, body), submit(b.id, body)])
          assert.equal(responses.filter((r) => r.ok).length, 1)
          assert.deepEqual(
            responses.find((r) => !r.ok),
            { ok: false, code: 'TOUR_FEEDBACK_ALREADY_SUBMITTED' }
          )
          const saved = await prisma.tourFeedback.findUniqueOrThrow({
            where: { tourBookingId: b.id },
          })
          assert.deepEqual(saved.riskFlags, [])
          await assert.rejects(
            prisma.tourFeedback.update({ where: { id: saved.id }, data: { overallRating: 6 } })
          )
          await assert.rejects(
            prisma.tourFeedback.update({
              where: { id: saved.id },
              data: { comment: 'x'.repeat(2001) },
            })
          )
          await assert.rejects(prisma.tourBooking.delete({ where: { id: b.id } }))
          await assert.rejects(prisma.driver.delete({ where: { id: drivers[0].id } }))
        }
      )
      await t.test(
        'real authenticated mobile handlers return frozen targets and accept one complete submission',
        async () => {
          const b = await create()
          const context = { params: Promise.resolve({ tourBookingId: b.id }) }
          assert.equal(
            (await GET(new Request('https://preview.example.test/feedback'), context)).status,
            401
          )
          const tokens = await issueMobileTokens({
            user: users[0],
            principalType: 'CUSTOMER',
            device: {},
          })
          const headers = {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          }
          const read = await GET(
            new Request('https://preview.example.test/feedback', { headers }),
            context
          )
          assert.equal(read.status, 200)
          const json = await read.json()
          assert.equal(json.feedback.eligible, true)
          assert.equal(json.feedback.drivers.length, 1)
          assert.ok(!JSON.stringify(json).includes(tokens.accessToken))
          assert.ok(!JSON.stringify(json).includes('driverId'))
          const body = JSON.stringify({
            overallRating: 4,
            drivers: json.feedback.drivers.map((d: { targetId: string }) => ({
              targetId: d.targetId,
              ...positive,
            })),
          })
          const created = await POST(
            new Request('https://preview.example.test/feedback', { method: 'POST', headers, body }),
            context
          )
          assert.equal(created.status, 201)
          assert.equal((await created.json()).submission.overallRating, 4)
          const duplicate = await POST(
            new Request('https://preview.example.test/feedback', { method: 'POST', headers, body }),
            context
          )
          assert.equal(duplicate.status, 409)
          assert.equal((await duplicate.json()).error.code, 'TOUR_FEEDBACK_ALREADY_SUBMITTED')
          const otherTokens = await issueMobileTokens({
            user: users[1],
            principalType: 'CUSTOMER',
            device: {},
          })
          const foreign = await GET(
            new Request('https://preview.example.test/feedback', {
              headers: { Authorization: `Bearer ${otherTokens.accessToken}` },
            }),
            context
          )
          assert.equal(foreign.status, 404)
          const driverUser = await prisma.user.update({
            where: { id: users[1].id },
            data: { role: 'driver' },
          })
          await prisma.driver.update({
            where: { id: drivers[1].id },
            data: { userId: driverUser.id },
          })
          const driverTokens = await issueMobileTokens({
            user: driverUser,
            principalType: 'DRIVER',
            driverId: drivers[1].id,
            device: {},
          })
          const driverAccess = await GET(
            new Request('https://preview.example.test/feedback', {
              headers: { Authorization: `Bearer ${driverTokens.accessToken}` },
            }),
            context
          )
          assert.equal(driverAccess.status, 403)
          await prisma.driver.update({ where: { id: drivers[1].id }, data: { userId: null } })
          await prisma.user.update({ where: { id: users[1].id }, data: { role: 'user' } })
        }
      )
      await t.test(
        'real staged anonymization preserves private reports and attributed Days, tombstones Customer identity',
        async () => {
          const before = await prisma.tourFeedback.findMany({
            where: { customerId: users[0].id },
            include: { drivers: { include: { days: true } } },
            orderBy: { id: 'asc' },
          })
          assert.ok(before.length > 0)
          await prisma.user.update({
            where: { id: users[0].id },
            data: {
              deletionRequestedAt: new Date('2000-01-01'),
              scheduledDeletionAt: new Date('2000-01-02'),
            },
          })
          const result = await anonymizeDueCustomerAccounts()
          assert.ok(result.processed >= 1)
          const user = await prisma.user.findUniqueOrThrow({ where: { id: users[0].id } })
          assert.ok(user.anonymizedAt)
          assert.equal(user.name, 'Deleted Beninfy Customer')
          assert.notEqual(user.email, users[0].email)
          assert.deepEqual(
            await prisma.tourFeedback.findMany({
              where: { customerId: user.id },
              include: { drivers: { include: { days: true } } },
              orderBy: { id: 'asc' },
            }),
            before
          )
        }
      )
    } finally {
      if (oldSecret === undefined) delete process.env.MOBILE_AUTH_SECRET
      else process.env.MOBILE_AUTH_SECRET = oldSecret
      const reports = await prisma.tourFeedback.findMany({
        where: { tourBookingId: { in: bookingIds } },
        select: { id: true },
      })
      const ids = reports.map((r) => r.id)
      await prisma.tourFeedbackDay.deleteMany({
        where: { tourDriverFeedback: { tourFeedbackId: { in: ids } } },
      })
      await prisma.tourDriverFeedback.deleteMany({ where: { tourFeedbackId: { in: ids } } })
      await prisma.tourFeedback.deleteMany({ where: { id: { in: ids } } })
      await prisma.tourBooking.deleteMany({ where: { id: { in: bookingIds } } })
      await prisma.mobileSession.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
      await prisma.driver.deleteMany({ where: { id: { in: drivers.map((d) => d.id) } } })
      await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
      await prisma.$disconnect()
    }
  }
)
