import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { validateCouponCode } from '../src/lib/coupons'
import { markPaymentPaidAndReserveBooking } from '../src/lib/paymentSettlement'

const url = process.env.DRIVER_SEARCH_TEST_DATABASE_URL

test(
  'Ride coupons reserve capacity while unpaid and redeem exactly once at settlement',
  { skip: !url },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.equal(target.hostname, '127.0.0.1')
    assert.match(target.pathname, /^\/beninfy_dispatch_test/)

    const prefix = `ride-coupon-${randomUUID()}`
    const user = await prisma.user.create({
      data: { email: `${prefix}@example.test`, name: 'Ride coupon fixture' },
    })
    await prisma.vehicle.create({
      data: { id: prefix, name: 'Ride coupon fixture', capacity: 4 },
    })
    const coupon = await prisma.coupon.create({
      data: {
        code: prefix.toUpperCase(),
        applicability: 'ride',
        discountType: 'fixed',
        amountNGN: 5000,
        maxRedemptions: 1,
        maxPerCustomer: 1,
      },
    })
    const bookingIds: string[] = []
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Live network forbidden')
    })

    const createBooking = async (status = 'pending') => {
      const booking = await prisma.booking.create({
        data: {
          userId: user.id,
          vehicleId: prefix,
          from: 'Lagos',
          to: 'Cotonou',
          date: new Date('2099-01-01'),
          passengers: 1,
          priceNGN: 95000,
          discountNGN: 5000,
          couponId: coupon.id,
          couponCode: coupon.code,
          status,
          legs: {
            create: {
              direction: 'outbound',
              vehicleId: prefix,
              from: 'Lagos',
              to: 'Cotonou',
              departureDate: new Date('2099-01-01'),
              status: status === 'cancelled' ? 'cancelled' : 'payment_pending',
            },
          },
        },
      })
      bookingIds.push(booking.id)
      return booking
    }

    try {
      const pending = await createBooking()
      const held = await validateCouponCode(coupon.code, 100000, prisma, {
        product: 'ride',
        userId: user.id,
      })
      assert.deepEqual(held, { ok: false, error: 'Coupon code has reached its usage limit' })
      assert.equal(
        (await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redeemedCount,
        0
      )

      await prisma.booking.update({ where: { id: pending.id }, data: { status: 'cancelled' } })
      const released = await validateCouponCode(coupon.code, 100000, prisma, {
        product: 'ride',
        userId: user.id,
      })
      assert.equal(released.ok, true)

      const payable = await createBooking()
      const payment = await prisma.payment.create({
        data: {
          bookingId: payable.id,
          reference: randomUUID(),
          amountNGN: payable.priceNGN,
          status: 'pending',
        },
      })
      const first = await markPaymentPaidAndReserveBooking({
        paymentId: payment.id,
        bookingId: payable.id,
        paymentData: { paidAt: new Date() },
      })
      const duplicate = await markPaymentPaidAndReserveBooking({
        paymentId: payment.id,
        bookingId: payable.id,
        paymentData: { paidAt: new Date() },
      })
      assert.equal(first.ok, true)
      assert.equal(duplicate.ok, true)
      assert.equal(duplicate.ok && duplicate.alreadySettled, true)

      const settled = await prisma.booking.findUniqueOrThrow({ where: { id: payable.id } })
      assert.ok(settled.couponRedeemedAt)
      assert.equal(
        (await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).redeemedCount,
        1
      )
      assert.equal(
        await prisma.notification.count({
          where: { userId: user.id, type: 'payment.confirmed' },
        }),
        1
      )
    } finally {
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } })
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } })
      await prisma.notification.deleteMany({ where: { userId: user.id } })
      await prisma.coupon.delete({ where: { id: coupon.id } })
      await prisma.user.delete({ where: { id: user.id } })
      await prisma.vehicle.delete({ where: { id: prefix } })
      await prisma.$disconnect()
    }
  }
)
