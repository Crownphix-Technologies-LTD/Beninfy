import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from 'pg'
import type { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { changeDriverSearch } from '../src/lib/admin/driverSearch'
import { driverSearchStatusAfterLegUpdate } from '../src/lib/driverAssignmentStatus'
import { applyDriverTripAction } from '../src/lib/mobile/tripTransitions'
import { markPaymentPaidAndReserveBooking } from '../src/lib/paymentSettlement'

// Opt-in: a disposable local database with all migrations applied.
const url = process.env.DRIVER_SEARCH_TEST_DATABASE_URL

test('Driver search PostgreSQL lifecycle and concurrency', { skip: !url }, async (t) => {
  assert.equal(process.env.DATABASE_URL, url, 'All connections must use the isolated database')
  const target = new URL(url!)
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
  assert.ok(target.pathname.startsWith('/beninfy_dispatch_test'))
  const sql = new Client({ connectionString: url })
  await sql.connect()
  const prefix = 'dispatch-test-' + randomUUID()
  const driver = await prisma.driver.create({ data: { name: prefix, phone: '+229000' } })
  await prisma.vehicle.create({ data: { id: prefix, name: prefix, capacity: 4 } })
  const bookingIds: string[] = []
  const legIds: string[] = []
  async function fixture(status = 'reserved', bookingStatus = 'confirmed') {
    const booking = await prisma.booking.create({
      data: {
        from: 'Lagos',
        to: 'Cotonou',
        date: new Date('2099-01-01'),
        vehicleId: prefix,
        passengers: 1,
        priceNGN: 10000,
        status: bookingStatus,
        legs: {
          create: {
            direction: 'outbound',
            from: 'Lagos',
            to: 'Cotonou',
            departureDate: new Date('2099-01-01'),
            vehicleId: prefix,
            status,
          },
        },
      },
      include: { legs: true },
    })
    bookingIds.push(booking.id)
    legIds.push(booking.legs[0].id)
    return { booking, leg: booking.legs[0] }
  }
  async function assign(id: string, driverId: string | null) {
    return prisma.bookingLeg.update({
      where: { id },
      data: {
        driverId,
        status: 'assigned',
        driverSearchStatus: driverSearchStatusAfterLegUpdate({ driverId }),
      },
    })
  }
  async function blocked() {
    for (let i = 0; i < 100; i++) {
      const rows = await sql.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      )
      if (rows.rowCount) return
      await delay(20)
    }
    assert.fail('Expected competing operation to wait on a PostgreSQL row lock')
  }
  try {
    await t.test(
      'migration defaults existing rows to idle and enforces assignment invariant',
      async () => {
        await sql.query('BEGIN')
        try {
          await sql.query('CREATE TEMP TABLE "BookingLeg" (id text, "driverId" text, status text)')
          await sql.query(
            "INSERT INTO \"BookingLeg\" VALUES ('old-reserved', NULL, 'reserved'), ('old-unassigned', NULL, 'unassigned')"
          )
          await sql.query('SET LOCAL search_path TO pg_temp')
          await sql.query(
            readFileSync(
              'prisma/migrations/20260915120000_driver_search_state/migration.sql',
              'utf8'
            )
          )
          const rows = await sql.query('SELECT "driverSearchStatus" FROM "BookingLeg"')
          assert.deepEqual(
            rows.rows.map((row) => row.driverSearchStatus),
            ['idle', 'idle']
          )
          await assert.rejects(
            sql.query(
              'UPDATE "BookingLeg" SET "driverId" = \'driver\', "driverSearchStatus" = \'searching\''
            )
          )
        } finally {
          await sql.query('ROLLBACK')
        }
      }
    )
    await t.test(
      'explicit Start/Stop is idempotent; fleet-only assignment preserves search',
      async () => {
        const { leg } = await fixture()
        assert.equal(leg.driverSearchStatus, 'idle')
        for (const action of ['start', 'start', 'stop', 'stop'] as const) {
          const result = await changeDriverSearch(leg.id, action)
          assert.equal(result.ok, true)
          if (result.ok)
            assert.equal(
              result.bookingLeg.driverSearchStatus,
              action === 'start' ? 'searching' : 'idle'
            )
        }
        await changeDriverSearch(leg.id, 'start')
        const fleetOnly = await prisma.bookingLeg.update({
          where: { id: leg.id },
          data: {
            status: 'assigned',
            driverSearchStatus: driverSearchStatusAfterLegUpdate({ status: 'assigned' }),
          },
        })
        assert.equal(fleetOnly.driverSearchStatus, 'searching')
        assert.equal(fleetOnly.driverId, null)
        const assigned = await assign(leg.id, driver.id)
        assert.equal(assigned.driverSearchStatus, 'idle')
        assert.equal((await changeDriverSearch(leg.id, 'start')).ok, false)
        const removed = await assign(leg.id, null)
        assert.equal(removed.driverSearchStatus, 'idle')
        assert.equal((await changeDriverSearch(leg.id, 'start')).ok, true)
      }
    )
    await t.test('Start rejects unavailable, terminal and non-ready states', async () => {
      assert.equal((await changeDriverSearch('missing-leg', 'start')).ok, false)
      for (const [status, bookingStatus] of [
        ['payment_pending', 'pending'],
        ['reserved', 'ops_review'],
        ['cancelled', 'confirmed'],
        ['completed', 'confirmed'],
        ['reserved', 'cancelled'],
        ['reserved', 'completed'],
        ['driver_en_route', 'confirmed'],
        ['in_progress', 'confirmed'],
      ]) {
        const { leg } = await fixture(status, bookingStatus)
        assert.equal((await changeDriverSearch(leg.id, 'start')).ok, false)
        assert.equal(
          (await prisma.bookingLeg.findUniqueOrThrow({ where: { id: leg.id } })).driverSearchStatus,
          'idle'
        )
      }
    })
    await t.test('assignment wins when Start is waiting on its row', async () => {
      const { leg } = await fixture()
      await sql.query('BEGIN')
      await sql.query('SELECT id FROM "BookingLeg" WHERE id = $1 FOR UPDATE', [leg.id])
      const search = changeDriverSearch(leg.id, 'start')
      try {
        await blocked()
        await sql.query(
          'UPDATE "BookingLeg" SET "driverId" = $1, status = $2, "driverSearchStatus" = $3 WHERE id = $4',
          [driver.id, 'assigned', driverSearchStatusAfterLegUpdate({ driverId: driver.id }), leg.id]
        )
      } finally {
        await sql.query('COMMIT')
      }
      assert.equal((await search).ok, false)
      const row = await prisma.bookingLeg.findUniqueOrThrow({ where: { id: leg.id } })
      assert.equal(row.driverId, driver.id)
      assert.equal(row.driverSearchStatus, 'idle')
    })
    await t.test('assignment clears Start that commits first', async () => {
      const { leg } = await fixture()
      const ready = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const staged = {
        $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
          prisma.$transaction(async (tx) => {
            const result = await fn(tx)
            ready.resolve()
            await release.promise
            return result
          }),
      } as typeof prisma
      const search = changeDriverSearch(leg.id, 'start', staged)
      await ready.promise
      const assignment = assign(leg.id, driver.id)
      try {
        await blocked()
      } finally {
        release.resolve()
      }
      assert.equal((await search).ok, true)
      assert.equal((await assignment).driverSearchStatus, 'idle')
    })
    await t.test('Stop and assignment racing always finish assigned and idle', async () => {
      const { leg } = await fixture()
      await changeDriverSearch(leg.id, 'start')
      await Promise.all([changeDriverSearch(leg.id, 'stop'), assign(leg.id, driver.id)])
      const row = await prisma.bookingLeg.findUniqueOrThrow({ where: { id: leg.id } })
      assert.equal(row.driverId, driver.id)
      assert.equal(row.driverSearchStatus, 'idle')
    })
    await t.test('hold/cancellation that commits first prevents Start', async () => {
      for (const status of ['ops_review', 'cancelled', 'completed']) {
        const { booking, leg } = await fixture()
        await sql.query('BEGIN')
        await sql.query('UPDATE "Booking" SET status = $1 WHERE id = $2', [status, booking.id])
        const search = changeDriverSearch(leg.id, 'start')
        try {
          await blocked()
        } finally {
          await sql.query('COMMIT')
        }
        assert.equal((await search).ok, false)
      }
    })
    await t.test('booking hold/cancellation after Start clears persisted search', async () => {
      for (const status of ['ops_review', 'cancelled', 'completed']) {
        const { booking, leg } = await fixture()
        await changeDriverSearch(leg.id, 'start')
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            status,
            legs: { updateMany: { where: {}, data: { driverSearchStatus: 'idle' } } },
          },
        })
        assert.equal(
          (await prisma.bookingLeg.findUniqueOrThrow({ where: { id: leg.id } })).driverSearchStatus,
          'idle'
        )
      }
    })
    await t.test(
      'actual Driver decline returns to idle until Operations explicitly restarts',
      async () => {
        const { leg } = await fixture()
        await changeDriverSearch(leg.id, 'start')
        await assign(leg.id, driver.id)
        const result = await applyDriverTripAction({
          req: new Request('http://localhost/test'),
          bookingLegId: leg.id,
          action: 'decline',
          principal: {
            type: 'DRIVER',
            userId: prefix,
            driverId: driver.id,
            email: 'test@example.com',
            role: 'driver',
            sessionId: prefix,
          },
        })
        assert.equal(result.ok, true)
        const row = await prisma.bookingLeg.findUniqueOrThrow({ where: { id: leg.id } })
        assert.equal(row.driverId, null)
        assert.equal(row.status, 'unassigned')
        assert.equal(row.driverSearchStatus, 'idle')
        assert.equal((await changeDriverSearch(leg.id, 'start')).ok, true)
      }
    )
    await t.test(
      'actual settlement confirms future reservation without starting search',
      async () => {
        const { booking, leg } = await fixture('payment_pending', 'pending')
        const payment = await prisma.payment.create({
          data: {
            bookingId: booking.id,
            reference: randomUUID(),
            provider: 'paystack',
            amountNGN: 10000,
            status: 'pending',
          },
        })
        const result = await markPaymentPaidAndReserveBooking({
          paymentId: payment.id,
          bookingId: booking.id,
          paymentData: {},
        })
        assert.equal(result.ok, true)
        const row = await prisma.bookingLeg.findUniqueOrThrow({ where: { id: leg.id } })
        assert.equal(row.status, 'reserved')
        assert.equal(row.driverSearchStatus, 'idle')
      }
    )
  } finally {
    await sql.end()
    await prisma.auditLog.deleteMany({ where: { entityId: { in: legIds } } })
    await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } })
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } })
    await prisma.driver.delete({ where: { id: driver.id } })
    await prisma.vehicle.delete({ where: { id: prefix } })
    await prisma.$disconnect()
  }
})
