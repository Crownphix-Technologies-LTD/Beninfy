import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { prisma } from '../src/lib/prisma'
import {
  isPaymentSerializationConflict,
  retryPaymentSerialization,
} from '../src/lib/paymentSerialization'
import { cancelCustomerBooking } from '../src/lib/mobile/customerAccount'
import { markPaymentPaidAndReserveBooking } from '../src/lib/paymentSettlement'

function error(code: string, sqlstate?: string) {
  return new Prisma.PrismaClientKnownRequestError('synthetic database failure', {
    code,
    clientVersion: 'test',
    meta: { code: sqlstate },
  })
}
test('payment retries only PostgreSQL serialization/deadlock errors, with three attempts maximum', async () => {
  for (const failure of [
    error('P2034'),
    error('P2010', '40001'),
    error('P2010', '40P01'),
    new Prisma.PrismaClientKnownRequestError('adapter fixture', {
      code: 'P2010',
      clientVersion: 'test',
      meta: {
        driverAdapterError: { cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } },
      },
    }),
  ]) {
    assert.equal(isPaymentSerializationConflict(failure), true)
    let calls = 0
    assert.equal(
      await retryPaymentSerialization(async () => {
        if (++calls < 3) throw failure
        return 'paid'
      }),
      'paid'
    )
    assert.equal(calls, 3)
    calls = 0
    await assert.rejects(
      retryPaymentSerialization(async () => {
        calls++
        throw failure
      }),
      (value) => value === failure
    )
    assert.equal(calls, 3)
  }
  for (const failure of [
    error('P2010', '42501'),
    error('P2002'),
    new Error('not a database conflict'),
  ]) {
    assert.equal(isPaymentSerializationConflict(failure), false)
    let calls = 0
    await assert.rejects(
      retryPaymentSerialization(async () => {
        calls++
        throw failure
      }),
      (value) => value === failure
    )
    assert.equal(calls, 1)
  }
})

const url = process.env.DRIVER_SEARCH_TEST_DATABASE_URL
test(
  'real PostgreSQL cancellation/settlement lock orders retain authoritative paid state',
  { skip: !url, timeout: 60000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.equal(target.hostname, '127.0.0.1')
    assert.match(target.pathname, /^\/beninfy_dispatch_test/)
    const prefix = 'payment-race-' + randomUUID()
    const customer = await prisma.user.create({
      data: { id: prefix, email: prefix + '@example.test' },
    })
    await prisma.vehicle.create({
      data: { id: prefix, name: 'Synthetic payment fixture', capacity: 4 },
    })
    const bookingIds: string[] = []
    const sql = new Client({ connectionString: url })
    await sql.connect()
    const observer = new Client({ connectionString: url })
    await observer.connect()
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Live network forbidden')
    })
    async function waiting(count: number) {
      for (let i = 0; i < 100; i++) {
        const r = await observer.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
        )
        if (r.rows[0].n >= count) return
        await delay(20)
      }
      assert.fail('Expected competing PostgreSQL row locks')
    }
    try {
      for (const first of ['cancellation', 'settlement'] as const)
        await t.test(first + ' acquires the booking lock first', async () => {
          const booking = await prisma.booking.create({
            data: {
              userId: customer.id,
              vehicleId: prefix,
              from: 'Fixture A',
              to: 'Fixture B',
              date: new Date('2099-01-01'),
              passengers: 1,
              priceNGN: 10000,
              status: 'pending',
              legs: {
                create: {
                  direction: 'outbound',
                  vehicleId: prefix,
                  from: 'Fixture A',
                  to: 'Fixture B',
                  departureDate: new Date('2099-01-01'),
                  status: 'payment_pending',
                },
              },
            },
          })
          bookingIds.push(booking.id)
          const payment = await prisma.payment.create({
            data: {
              bookingId: booking.id,
              reference: randomUUID(),
              amountNGN: 10000,
              status: 'pending',
            },
          })
          const cancel = () =>
            cancelCustomerBooking({
              principal: {
                type: 'CUSTOMER',
                userId: customer.id,
                email: customer.email!,
                role: 'user',
                sessionId: 'fixture',
              },
              bookingId: booking.id,
              reasonCode: 'checkout_cancelled',
            })
          const settle = () =>
            markPaymentPaidAndReserveBooking({
              paymentId: payment.id,
              bookingId: booking.id,
              paymentData: { paidAt: new Date() },
            })
          await sql.query('BEGIN')
          await sql.query('SELECT id FROM "Booking" WHERE id = $1 FOR UPDATE', [booking.id])
          const firstCall = first === 'cancellation' ? cancel() : settle()
          let secondCall: ReturnType<typeof cancel> | ReturnType<typeof settle> | undefined
          try {
            await waiting(1)
            secondCall = first === 'cancellation' ? settle() : cancel()
            await waiting(2)
          } finally {
            await sql.query('COMMIT')
          }
          await Promise.all([firstCall, secondCall])
          assert.equal(
            (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
            'paid'
          )
          const result = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
            include: { legs: true },
          })
          assert.equal(result.status, first === 'cancellation' ? 'ops_review' : 'confirmed')
          assert.equal(result.legs[0].status, first === 'cancellation' ? 'cancelled' : 'reserved')
        })
      for (const state of ['pending', 'cancelled', 'ops_review', 'confirmed', 'completed']) {
        await t.test('retry exhaustion preserves authoritative ' + state + ' outcome', async () => {
          const paymentId = randomUUID()
          const booking = await prisma.booking.create({ data: {
            userId: customer.id, vehicleId: prefix, from: 'Fixture A', to: 'Fixture B',
            date: new Date('2099-01-01'), passengers: 1, priceNGN: 10000, status: state,
            legs: { create: { direction: 'outbound', vehicleId: prefix, from: 'Fixture A',
              to: 'Fixture B', departureDate: new Date('2099-01-01'),
              status: state === 'cancelled' ? 'cancelled' : state === 'completed' ? 'completed' : state === 'confirmed' ? 'reserved' : 'payment_pending' } },
          } })
          bookingIds.push(booking.id)
          const payment = await prisma.payment.create({ data: {
            id: paymentId, bookingId: booking.id, reference: randomUUID(), amountNGN: 10000,
            status: state === 'confirmed' || state === 'completed' ? 'paid' : 'pending',
          } })
          const before = await prisma.bookingLeg.findMany({ where: { bookingId: booking.id } })
          const transaction = prisma.$transaction
          let attempts = 0
          prisma.$transaction = ((...args: Parameters<typeof prisma.$transaction>) => {
            if (args[1]?.isolationLevel === Prisma.TransactionIsolationLevel.Serializable) {
              attempts++
              return Promise.reject(error('P2010', '40001'))
            }
            return transaction.apply(prisma, args)
          }) as typeof prisma.$transaction
          const result = await markPaymentPaidAndReserveBooking({ paymentId, bookingId: booking.id, paymentData: {} }).finally(() => { prisma.$transaction = transaction })
          assert.equal(attempts, 3)
          assert.equal(result.ok, state === 'confirmed' || state === 'completed')
          assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:booking.id}})).status,
            state === 'confirmed' || state === 'completed' ? state : 'ops_review')
          const after = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
          assert.equal(after.status, 'paid')
          assert.equal(after.reference, payment.reference)
          assert.equal(after.amountNGN, payment.amountNGN)
          assert.equal(after.provider, payment.provider)
          assert.deepEqual((await prisma.bookingLeg.findMany({where:{bookingId:booking.id}})).map(l=>l.status),before.map(l=>l.status))
          // Duplicate provider callbacks must not create another settlement or refund.
          await Promise.all([1, 2].map(() => markPaymentPaidAndReserveBooking({ paymentId, bookingId: booking.id, paymentData: {} })))
          assert.equal(await prisma.payment.count({where:{bookingId:booking.id}}),1)
          assert.equal(await prisma.paymentResolution.count({where:{bookingId:booking.id}}),0)
          assert.equal((await prisma.booking.findUniqueOrThrow({where:{id:booking.id}})).status,
            state === 'confirmed' || state === 'completed' ? state : 'ops_review')
        })
      }
    } finally {
      await sql.end()
      await observer.end()
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } })
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } })
      await prisma.notification.deleteMany({ where: { userId: customer.id } })
      await prisma.user.delete({ where: { id: customer.id } })
      await prisma.vehicle.delete({ where: { id: prefix } })
      await prisma.$disconnect()
    }
  }
)
