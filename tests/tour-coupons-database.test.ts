import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { setTourCoupon } from '../src/lib/mobile/tourCoupons'
import { initiateMobileTourBookingPayment } from '../src/lib/mobile/tourPayments'
import { cancelCustomerTourBooking } from '../src/lib/mobile/tourBookings'
import { markPaymentPaidAndConfirmTourBooking } from '../src/lib/paymentSettlement'
import { calculateTourCommercialSnapshot, CANONICAL_TOUR_IDS } from '../src/lib/tourCommercial'
import type { MobilePrincipal } from '../src/lib/mobile/auth'

const url = process.env.TOUR_ITINERARY_TEST_DATABASE_URL
test(
  'Tour coupon PostgreSQL reservations, frozen checkout and idempotent settlement',
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
          data: { name: 'Coupon fixture', email: `${prefix}-${i}@example.test` },
        })
      )
    )
    const principals = users.map(
      (u) => ({ userId: u.id, email: u.email, role: 'CUSTOMER' }) as MobilePrincipal
    )
    const created: string[] = []
    const coupons: string[] = []
    const book = async (user = 0, count = 3, gogotinkpo = true, custom = false) => {
      const commercial = calculateTourCommercialSnapshot({
        tourIds: CANONICAL_TOUR_IDS.slice(0, count),
        priceMinor: 10000000,
        gogotinkpo,
      })
      const b = await prisma.tourBooking.create({
        data: {
          userId: users[user].id,
          tourId: CANONICAL_TOUR_IDS[0],
          reference: 'fixture-' + randomUUID(),
          tourTitle: 'Fixture',
          tourCountry: 'Benin',
          selectedTourIds: CANONICAL_TOUR_IDS.slice(0, count),
          commercialSnapshot: commercial,
          priceNGN: custom ? 0 : commercial.priceNGN,
          subtotalNGN: custom ? null : commercial.priceNGN,
          startDate: new Date('2030-01-01'),
          endDate: new Date('2030-01-03'),
          travellers: 3,
          itineraryMode: custom ? 'custom' : 'standard',
          status: custom ? 'quote_pending' : 'payment_pending',
          quoteStatus: custom ? 'pending' : 'not_required',
        },
      })
      created.push(b.id)
      return b
    }
    const coupon = async (data: object = {}) => {
      const c = await prisma.coupon.create({
        data: {
          code: ('FIXTURE-' + randomUUID()).toUpperCase(),
          applicability: 'tour',
          discountType: 'percent',
          percent: 10,
          ...data,
        },
      })
      coupons.push(c.id)
      return c
    }
    const apply = (id: string, code: string | null, user = 0) =>
      setTourCoupon({ tourBookingId: id, principal: principals[user], code })
    const old = { enabled: process.env.PAYMENTS_ENABLED, key: process.env.PAYSTACK_SECRET_KEY }
    process.env.PAYMENTS_ENABLED = 'true'
    process.env.PAYSTACK_SECRET_KEY = 'fixture-only-paystack-secret'
    let calls = 0
    t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
      assert.equal(String(input), 'https://api.paystack.co/transaction/initialize')
      calls++
      const body = JSON.parse(String(init?.body))
      assert.equal(body.amount, 28800000)
      return Response.json({
        status: true,
        data: {
          reference: body.reference,
          access_code: 'fixture-access-code',
          authorization_url: 'https://checkout.paystack.com/fixture',
        },
      })
    })
    try {
      await t.test('migration preserves existing Ride scope and additive snapshots', async () => {
        const legacy = await prisma.coupon.create({
          data: {
            code: ('LEGACY-' + randomUUID()).toUpperCase(),
            discountType: 'fixed',
            amountNGN: 1000,
          },
        })
        coupons.push(legacy.id)
        assert.equal(legacy.applicability, 'ride')
        const b = await book()
        assert.equal((await apply(b.id, legacy.code)).ok, false)
        assert.equal((await apply(b.id, (await coupon({ applicability: 'both' })).code)).ok, true)
      })
      await t.test(
        'replace/remove recalculate subtotal, reject foreign owner and enforce custom quote gate',
        async () => {
          const b = await book()
          const c = await coupon()
          const fixed = await coupon({ discountType: 'fixed', percent: null, amountNGN: 20000 })
          const applied = await apply(b.id, c.code)
          assert.ok(applied.ok)
          assert.equal(applied.pricing.subtotal.value, 320000)
          assert.equal(applied.pricing.total.value, 288000)
          assert.equal((await apply(b.id, c.code, 1)).ok, false)
          const replaced = await apply(b.id, fixed.code)
          assert.ok(replaced.ok)
          assert.equal(replaced.pricing.total.value, 300000)
          const removed = await apply(b.id, null)
          assert.ok(removed.ok)
          assert.equal(removed.pricing.total.value, 320000)
          assert.equal(removed.pricing.coupon, null)
          const custom = await book(0, 1, false, true)
          assert.deepEqual(await apply(custom.id, c.code), {
            ok: false,
            code: 'TOUR_QUOTE_REQUIRED',
          })
          await prisma.tourBooking.update({
            where: { id: custom.id },
            data: {
              status: 'payment_pending',
              quoteStatus: 'approved',
              priceNGN: 200000,
              subtotalNGN: 200000,
            },
          })
          const approved = await apply(custom.id, c.code)
          assert.ok(approved.ok)
          assert.equal(approved.pricing.total.value, 180000)
        }
      )
      await t.test(
        'concurrent final redemption cannot exceed global or per-customer limit',
        async () => {
          const c = await coupon({ maxRedemptions: 1 })
          const a = await book(0)
          const b = await book(1)
          const result = await Promise.all([apply(a.id, c.code), apply(b.id, c.code, 1)])
          assert.equal(result.filter((r) => r.ok).length, 1)
          assert.equal(
            await prisma.tourCouponUse.count({ where: { couponId: c.id, status: 'reserved' } }),
            1
          )
          const per = await coupon({ maxPerCustomer: 1 })
          const x = await book()
          const y = await book()
          assert.equal(
            (await Promise.all([apply(x.id, per.code), apply(y.id, per.code)])).filter((r) => r.ok)
              .length,
            1
          )
        }
      )
      await t.test(
        'checkout locks pricing, uses frozen amount, reuses payment and redeems once across duplicate settlement',
        async () => {
          const b = await book()
          const c = await coupon({ maxRedemptions: 1 })
          assert.ok((await apply(b.id, c.code)).ok)
          const init = {
            tourBookingId: b.id,
            principal: principals[0],
            provider: 'paystack' as const,
            locale: 'en' as const,
            origin: 'https://preview.example.test',
          }
          const first = await initiateMobileTourBookingPayment(init)
          assert.ok(first.ok)
          assert.ok(first.payment)
          assert.equal(first.dto.checkout?.accessCode, 'fixture-access-code')
          assert.equal(first.payment.amountNGN, 288000)
          const snapshot = first.payment.tourPricingSnapshot
          assert.ok(snapshot)
          assert.deepEqual(await apply(b.id, null), { ok: false, code: 'TOUR_PRICING_LOCKED' })
          const second = await initiateMobileTourBookingPayment(init)
          assert.ok(second.ok)
          assert.equal(second.reused, true)
          assert.equal(second.payment?.id, first.payment.id)
          assert.equal(calls, 1)
          await prisma.coupon.update({ where: { id: c.id }, data: { active: false, percent: 99 } })
          const settlement = {
            paymentId: first.payment.id,
            tourBookingId: b.id,
            amountNGN: 288000,
            provider: 'paystack',
            paymentData: { paidAt: new Date() },
          }
          const results = await Promise.all([
            markPaymentPaidAndConfirmTourBooking(settlement),
            markPaymentPaidAndConfirmTourBooking(settlement),
          ])
          assert.equal(results.filter((r) => r.alreadySettled).length, 1)
          assert.equal(
            (await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).redeemedCount,
            1
          )
          assert.deepEqual(await apply(b.id, null), {
            ok: false,
            code: 'PAYMENT_ALREADY_COMPLETED',
          })
          assert.deepEqual(
            (await prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } }))
              .tourPricingSnapshot,
            snapshot
          )
          const paid = await initiateMobileTourBookingPayment(init)
          assert.equal(paid.ok, false)
        }
      )
      await t.test('expired draft capacity is revalidated and zero-payable coupons settle without a provider', async () => {
        const c = await coupon({ maxRedemptions: 1 })
        const a = await book(); const b = await book(1)
        assert.ok((await apply(a.id, c.code)).ok)
        await prisma.tourCouponUse.update({ where: { tourBookingId: a.id }, data: { expiresAt: new Date('2000-01-01') } })
        assert.ok((await apply(b.id, c.code, 1)).ok)
        const init = { tourBookingId: a.id, principal: principals[0], provider: 'paystack' as const, locale: 'en' as const, origin: 'https://preview.example.test' }
        assert.deepEqual(await initiateMobileTourBookingPayment(init), { ok: false, code: 'COUPON_INVALID' })
        const free = await coupon({ percent: 100, maxRedemptions: 1 })
        const zero = await book(); assert.ok((await apply(zero.id, free.code)).ok)
        const result = await initiateMobileTourBookingPayment({ ...init, tourBookingId: zero.id })
        assert.ok(result.ok); assert.ok('zeroPayable' in result && result.zeroPayable)
        assert.equal(await prisma.payment.count({ where: { tourBookingId: zero.id } }), 0)
        assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: free.id } })).redeemedCount, 1)
        assert.equal(calls, 1)
      })
      await t.test('explicit Tour checkout cancellation is idempotent and settlement wins races', async () => {
        const unpaid = await book(0, 1, false)
        const day = await prisma.tourBookingDay.create({
          data: {
            tourBookingId: unpaid.id,
            dayNumber: 1,
            scheduledDate: new Date('2030-01-01'),
            status: 'upcoming',
            title: 'Fixture day',
            stops: {
              create: {
                sortOrder: 1,
                title: 'Fixture stop',
                address: 'Fixture address',
                latitude: 6.3,
                longitude: 2.4,
              },
            },
          },
        })
        const pending = await prisma.payment.create({
          data: {
            tourBookingId: unpaid.id,
            reference: randomUUID(),
            provider: 'paystack',
            amountNGN: unpaid.priceNGN,
            status: 'pending',
          },
        })
        const cancelled = await cancelCustomerTourBooking({
          principal: principals[0],
          tourBookingId: unpaid.id,
        })
        assert.ok(cancelled.ok)
        assert.equal(cancelled.cancelled, true)
        assert.equal(cancelled.paymentStatus, 'pending')
        assert.equal(
          (await prisma.payment.findUniqueOrThrow({ where: { id: pending.id } })).status,
          'pending'
        )
        assert.equal(
          (await prisma.tourBookingDay.findUniqueOrThrow({ where: { id: day.id } })).status,
          'cancelled'
        )
        const repeated = await cancelCustomerTourBooking({
          principal: principals[0],
          tourBookingId: unpaid.id,
        })
        assert.ok(repeated.ok)
        assert.equal(repeated.idempotent, true)
        assert.equal(repeated.cancelled, true)

        const race = await book(0, 1, false)
        await prisma.tourBookingDay.create({
          data: {
            tourBookingId: race.id,
            dayNumber: 1,
            scheduledDate: new Date('2030-01-01'),
            status: 'upcoming',
            title: 'Race day',
          },
        })
        const racePayment = await prisma.payment.create({
          data: {
            tourBookingId: race.id,
            reference: randomUUID(),
            provider: 'paystack',
            amountNGN: race.priceNGN,
            status: 'pending',
          },
        })
        await Promise.all([
          cancelCustomerTourBooking({ principal: principals[0], tourBookingId: race.id }),
          markPaymentPaidAndConfirmTourBooking({
            paymentId: racePayment.id,
            tourBookingId: race.id,
            amountNGN: race.priceNGN,
            provider: 'paystack',
            paymentData: { paidAt: new Date() },
          }),
        ])
        const won = await prisma.tourBooking.findUniqueOrThrow({ where: { id: race.id } })
        assert.equal(won.paymentStatus, 'paid')
        assert.equal(won.status, 'confirmed')
        assert.equal(won.cancelledAt, null)
        assert.equal(
          (await prisma.payment.findUniqueOrThrow({ where: { id: racePayment.id } })).status,
          'paid'
        )

        const foreign = await cancelCustomerTourBooking({
          principal: principals[1],
          tourBookingId: unpaid.id,
        })
        assert.deepEqual(foreign, { ok: false, code: 'TOUR_BOOKING_NOT_FOUND' })
      })
    } finally {
      if (old.enabled === undefined) delete process.env.PAYMENTS_ENABLED
      else process.env.PAYMENTS_ENABLED = old.enabled
      if (old.key === undefined) delete process.env.PAYSTACK_SECRET_KEY
      else process.env.PAYSTACK_SECRET_KEY = old.key
      await prisma.tourCouponUse.deleteMany({ where: { tourBookingId: { in: created } } })
      await prisma.payment.deleteMany({ where: { tourBookingId: { in: created } } })
      await prisma.tourBooking.deleteMany({ where: { id: { in: created } } })
      await prisma.coupon.deleteMany({ where: { id: { in: coupons } } })
      await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
      await prisma.$disconnect()
    }
  }
)
