import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { setTimeout as delay } from 'node:timers/promises'
import type { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { requireWorkerSecret } from '../src/lib/workerAuth'
import {
  anonymizeDueCustomerAccounts,
  restorePendingCustomerDeletion,
} from '../src/lib/mobile/customerProduct'
import {
  processAccountAvatarCleanups,
  accountDeletionWorkerMetrics,
} from '../src/lib/accountDeletionWorker'

test('account worker authentication fails closed and accepts only the configured secret', () => {
  const previous = { worker: process.env.WORKER_SECRET, cron: process.env.CRON_SECRET }
  const request = (headers: Record<string, string> = {}) =>
    new Request('https://www.beninfy.com/api/workers/accounts/anonymize', {
      method: 'POST',
      headers,
    })
  try {
    delete process.env.WORKER_SECRET
    delete process.env.CRON_SECRET
    const unavailable = requireWorkerSecret(request())
    assert.equal(unavailable.ok, false)
    if (!unavailable.ok) assert.equal(unavailable.response.status, 503)
    process.env.WORKER_SECRET = 'worker-local-fixture'
    process.env.CRON_SECRET = 'cron-local-fixture'
    const deniedHeaders: Array<Record<string, string>> = [
      {},
      { authorization: 'Bearer wrong' },
      { authorization: 'Bearer cron-local-fixture' },
    ]
    for (const headers of deniedHeaders) {
      const denied = requireWorkerSecret(request(headers))
      assert.equal(denied.ok, false)
      if (!denied.ok) assert.equal(denied.response.status, 401)
    }
    assert.equal(
      requireWorkerSecret(request({ authorization: 'Bearer worker-local-fixture' })).ok,
      true
    )
    assert.equal(
      requireWorkerSecret(request({ 'x-beninfy-worker-secret': 'worker-local-fixture' })).ok,
      true
    )
    delete process.env.WORKER_SECRET
    assert.equal(
      requireWorkerSecret(request({ authorization: 'Bearer cron-local-fixture' })).ok,
      true
    )
  } finally {
    for (const [key, value] of [
      ['WORKER_SECRET', previous.worker],
      ['CRON_SECRET', previous.cron],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

const url = process.env.WEB_DELETION_TEST_DATABASE_URL
test(
  'account anonymization lifecycle on disposable PostgreSQL',
  { skip: !url, timeout: 60000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_dispatch_test/)
    const prefix = 'deletion-worker-' + randomUUID()
    const ids: string[] = []
    const now = new Date()
    async function customer(offset = 0) {
      const user = await prisma.user.create({
        data: {
          id: prefix + '-' + ids.length,
          role: 'user',
          name: 'Synthetic worker fixture',
          email: `${prefix}-${ids.length}@example.test`,
          phone: '+10000000000',
          disabledAt: now,
          deletionRequestedAt: new Date(now.getTime() - 30 * 86400000),
          scheduledDeletionAt: new Date(now.getTime() + offset),
          savedPlaces: { create: { type: 'home', address: 'Synthetic fixture' } },
        },
      })
      ids.push(user.id)
      return user
    }
    // Scope candidate selection to this test's fixtures, preserving all real worker
    // eligibility predicates. Never process another test's synthetic users.
    const findMany = prisma.user.findMany.bind(prisma.user)
    const scopedFindMany = ((args: Parameters<typeof prisma.user.findMany>[0]) =>
      findMany({
        ...args,
        where: { AND: [args?.where ?? {}, { id: { in: ids } }] },
      })) as typeof prisma.user.findMany
    prisma.user.findMany = scopedFindMany
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Live network prohibited')
    })
    try {
      await t.test(
        'only due requests are processed; repeat execution does not change completed accounts',
        async () => {
          const due = await customer()
          const future = await customer(86400000)
          const result = await anonymizeDueCustomerAccounts({ now })
          assert.equal(result.processed, 1)
          const deleted = await prisma.user.findUniqueOrThrow({ where: { id: due.id } })
          assert.ok(deleted.anonymizedAt)
          assert.equal(deleted.phone, null)
          assert.equal(deleted.email, `deleted+${due.id}@deleted.beninfy.local`)
          assert.equal(await prisma.savedPlace.count({ where: { userId: due.id } }), 0)
          assert.equal(await prisma.savedPlace.count({ where: { userId: future.id } }), 1)
          assert.equal((await anonymizeDueCustomerAccounts({ now })).processed, 0)
          assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: due.id } }), deleted)
        }
      )
      await t.test(
        'restoration before selection prevents processing, keeps old sessions revoked and requires fresh login',
        async () => {
          const user = await customer()
          await prisma.mobileSession.create({
            data: {
              userId: user.id,
              refreshTokenHash: randomUUID(),
              expiresAt: new Date(now.getTime() + 86400000),
              revokedAt: now,
            },
          })
          assert.equal((await restorePendingCustomerDeletion({ userId: user.id })).ok, true)
          assert.equal((await anonymizeDueCustomerAccounts({ now })).processed, 0)
          const restored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
          assert.equal(restored.disabledAt, null)
          assert.equal(restored.deletionRequestedAt, null)
          assert.ok(restored.deletionCancelledAt)
          assert.equal(await prisma.savedPlace.count({ where: { userId: user.id } }), 1)
          assert.equal(
            await prisma.mobileSession.count({ where: { userId: user.id, revokedAt: null } }),
            0
          )
          const completed = ids[0]
          assert.equal((await restorePendingCustomerDeletion({ userId: completed })).ok, false)
        }
      )
      await t.test(
        'database failure leaves the request pending for a later invocation',
        async () => {
          const user = await customer()
          const transaction = prisma.$transaction
          try {
            prisma.$transaction = async () => {
              throw new Error('fixture database unavailable')
            }
            const failure = await anonymizeDueCustomerAccounts({ now })
            assert.equal(failure.failed, 1)
            assert.equal(failure.processed, 0)
            assert.equal(
              (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).anonymizedAt,
              null
            )
            assert.equal(await prisma.savedPlace.count({ where: { userId: user.id } }), 1)
          } finally {
            prisma.$transaction = transaction
          }
          assert.equal((await anonymizeDueCustomerAccounts({ now })).processed, 1)
        }
      )
      await t.test(
        'a restoration after candidate selection must not erase restored account data',
        async () => {
          const user = await customer()
          const selectCandidates = prisma.user.findMany.bind(prisma.user)
          prisma.user.findMany = (async (args: Parameters<typeof prisma.user.findMany>[0]) => {
            const candidates = await selectCandidates(args)
            assert.ok(candidates.some((candidate) => candidate.id === user.id))
            // Deterministically interleave a legitimate restoration after the worker's
            // SELECT but before its deletion transaction. This reproduces the race.
            assert.equal((await restorePendingCustomerDeletion({ userId: user.id })).ok, true)
            return candidates
          }) as typeof prisma.user.findMany
          assert.equal((await anonymizeDueCustomerAccounts({ now })).processed, 0)
          assert.equal(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).anonymizedAt,
            null
          )
          assert.equal(
            await prisma.savedPlace.count({ where: { userId: user.id } }),
            1,
            'A successfully restored account must retain its saved places'
          )
        }
      )
      prisma.user.findMany = scopedFindMany
      function gate(userId: string) {
        const ready = Promise.withResolvers<void>()
        const release = Promise.withResolvers<void>()
        const db = {
          user: prisma.user,
          $transaction: (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
            prisma.$transaction(
              async (tx) => {
                await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
                ready.resolve()
                await release.promise
                return callback(tx)
              },
              { timeout: 15000 }
            ),
        } as typeof prisma
        return { ready, release, db }
      }
      async function waitForRowLock() {
        const sql = new Client({ connectionString: url })
        await sql.connect()
        try {
          for (let i = 0; i < 100; i++) {
            const r = await sql.query(
              "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
            )
            if (r.rowCount) return
            await delay(15)
          }
          assert.fail('Expected real PostgreSQL row-lock contention')
        } finally {
          await sql.end()
        }
      }
      await t.test(
        'worker owns row lock first: restoration waits, then rejects committed anonymization',
        async () => {
          const user = await customer()
          const staged = gate(user.id)
          const work = anonymizeDueCustomerAccounts({ now }, staged.db)
          await staged.ready.promise
          const restore = restorePendingCustomerDeletion({ userId: user.id })
          try {
            await waitForRowLock()
          } finally {
            staged.release.resolve()
          }
          assert.equal((await work).processed, 1)
          assert.equal((await restore).ok, false)
          assert.equal(
            await prisma.auditLog.count({
              where: { entityId: user.id, action: 'customer.account.anonymized' },
            }),
            1
          )
        }
      )
      await t.test(
        'restoration owns row lock first: worker waits and revalidates without deleting anything',
        async () => {
          const user = await customer()
          const staged = gate(user.id)
          const restore = restorePendingCustomerDeletion({ userId: user.id }, staged.db)
          await staged.ready.promise
          const work = anonymizeDueCustomerAccounts({ now })
          try {
            await waitForRowLock()
          } finally {
            staged.release.resolve()
          }
          assert.equal((await restore).ok, true)
          assert.equal((await work).processed, 0)
          assert.equal(await prisma.savedPlace.count({ where: { userId: user.id } }), 1)
          assert.equal(await prisma.accountDeletionCleanup.count({ where: { userId: user.id } }), 0)
          assert.equal(
            await prisma.auditLog.count({
              where: { entityId: user.id, action: 'restore_deletion' },
            }),
            1
          )
        }
      )
      await t.test(
        'concurrent workers commit one anonymization and one completion audit',
        async () => {
          const user = await customer()
          const [a, b] = await Promise.all([
            anonymizeDueCustomerAccounts({ now }),
            anonymizeDueCustomerAccounts({ now }),
          ])
          assert.equal(a.processed + b.processed, 1)
          assert.equal(
            await prisma.auditLog.count({
              where: { entityId: user.id, action: 'customer.account.anonymized' },
            }),
            1
          )
        }
      )
      await t.test(
        'audit failure rolls back every anonymization mutation and cleanup enqueue',
        async () => {
          const user = await customer()
          await prisma.user.update({
            where: { id: user.id },
            data: { image: 'https://storage.fixture.test/avatar.png' },
          })
          const db = {
            user: prisma.user,
            $transaction: (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
              prisma.$transaction(async (tx) => {
                tx.auditLog.create = (() => {
                  throw new Error('Synthetic audit failure')
                }) as typeof tx.auditLog.create
                return callback(tx)
              }),
          } as typeof prisma
          assert.equal((await anonymizeDueCustomerAccounts({ now }, db)).failed, 1)
          assert.equal(await prisma.savedPlace.count({ where: { userId: user.id } }), 1)
          assert.equal(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).anonymizedAt,
            null
          )
          assert.equal(await prisma.accountDeletionCleanup.count({ where: { userId: user.id } }), 0)
          await prisma.user.update({ where: { id: user.id }, data: { image: null } })
          assert.equal((await anonymizeDueCustomerAccounts({ now })).processed, 1)
        }
      )
      await t.test(
        'durable avatar cleanup retries failure, treats 404 as success, and concurrent calls do not duplicate work',
        async (sub) => {
          const previous = {
            url: process.env.SUPABASE_URL,
            key: process.env.SUPABASE_SECRET_KEY,
            bucket: process.env.SUPABASE_STORAGE_BUCKET,
          }
          Object.assign(process.env, {
            SUPABASE_URL: 'https://storage.fixture.test',
            SUPABASE_SECRET_KEY: 'fixture-only',
            SUPABASE_STORAGE_BUCKET: 'beninfy-media',
          })
          let calls = 0,
            mode = 503
          sub.mock.method(
            globalThis,
            'fetch',
            async (_url: RequestInfo | URL, options?: RequestInit) => {
              calls++
              assert.equal(options?.method, 'DELETE')
              return new Response('fixture provider detail must not be stored', { status: mode })
            }
          )
          try {
            const user = await customer()
            const image = `https://storage.fixture.test/storage/v1/object/public/beninfy-media/avatars/${user.id}/1.png`
            await prisma.user.update({ where: { id: user.id }, data: { image } })
            assert.equal((await anonymizeDueCustomerAccounts({ now })).processed, 1)
            assert.equal(calls, 0, 'No external deletion inside anonymization transaction')
            let job = await prisma.accountDeletionCleanup.findUniqueOrThrow({
              where: { userId: user.id },
            })
            assert.equal(job.avatarUrl, image)
            const due = new Date(job.nextAttemptAt.getTime() + 1)
            assert.equal((await processAccountAvatarCleanups({ now: due })).failed, 1)
            job = await prisma.accountDeletionCleanup.findUniqueOrThrow({
              where: { userId: user.id },
            })
            assert.equal(job.attempts, 1)
            assert.equal(job.avatarUrl, image)
            assert.equal(job.errorCode, 'avatar_cleanup_unavailable')
            assert.equal(job.nextAttemptAt.getTime() - due.getTime(), 300000)
            assert.equal((await processAccountAvatarCleanups({ now: due })).checked, 0)
            mode = 404
            const retries = await Promise.all([
              processAccountAvatarCleanups({ now: job.nextAttemptAt }),
              processAccountAvatarCleanups({ now: job.nextAttemptAt }),
            ])
            assert.equal(
              retries.reduce((n, r) => n + r.succeeded, 0),
              1
            )
            assert.equal(calls, 2)
            job = await prisma.accountDeletionCleanup.findUniqueOrThrow({
              where: { userId: user.id },
            })
            assert.equal(job.status, 'succeeded')
            assert.equal(job.avatarUrl, null)
            assert.equal(
              (await processAccountAvatarCleanups({ now: job.nextAttemptAt })).checked,
              0
            )
            assert.equal(
              await prisma.auditLog.count({
                where: { entityId: user.id, action: 'customer.account.avatar_cleaned' },
              }),
              1
            )
            const crashUser = await customer()
            const crashImage = `https://storage.fixture.test/storage/v1/object/public/beninfy-media/avatars/${crashUser.id}/2.png`
            await prisma.user.update({ where: { id: crashUser.id }, data: { image: crashImage } })
            await anonymizeDueCustomerAccounts({ now })
            const crashJob = await prisma.accountDeletionCleanup.findUniqueOrThrow({
              where: { userId: crashUser.id },
            })
            const failingCommit = {
              accountDeletionCleanup: prisma.accountDeletionCleanup,
              $transaction: (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
                prisma.$transaction(async (tx) => {
                  tx.auditLog.create = (() => {
                    throw new Error('Synthetic failure after external DELETE')
                  }) as typeof tx.auditLog.create
                  return callback(tx)
                }),
            } as typeof prisma
            assert.equal(
              (await processAccountAvatarCleanups({ now: crashJob.nextAttemptAt }, failingCommit))
                .failed,
              1
            )
            const retained = await prisma.accountDeletionCleanup.findUniqueOrThrow({
              where: { id: crashJob.id },
            })
            assert.equal(retained.status, 'pending')
            assert.equal(retained.avatarUrl, crashImage)
            assert.equal(retained.attempts, 0, 'Failed commit must leave durable work retryable')
            assert.equal(
              (await processAccountAvatarCleanups({ now: crashJob.nextAttemptAt })).succeeded,
              1
            )
            assert.equal(calls, 4, 'Repeated external DELETE is safe after a lost database commit')
          } finally {
            for (const [key, value] of [
              ['SUPABASE_URL', previous.url],
              ['SUPABASE_SECRET_KEY', previous.key],
              ['SUPABASE_STORAGE_BUCKET', previous.bucket],
            ] as const) {
              if (value === undefined) delete process.env[key]
              else process.env[key] = value
            }
          }
        }
      )
      await t.test(
        'bounded cleanup retries retain blocked work and never delete a restored account avatar',
        async (sub) => {
          let calls = 0
          sub.mock.method(globalThis, 'fetch', async () => {
            calls++
            throw new Error('Synthetic network failure')
          })
          const user = await customer()
          await prisma.user.update({
            where: { id: user.id },
            data: {
              image:
                'https://storage.fixture.test/storage/v1/object/public/beninfy-media/avatars/fixture/1.png',
            },
          })
          await anonymizeDueCustomerAccounts({ now })
          for (let i = 0; i < 8; i++) {
            const job = await prisma.accountDeletionCleanup.findUniqueOrThrow({
              where: { userId: user.id },
            })
            await processAccountAvatarCleanups({ now: job.nextAttemptAt })
          }
          const job = await prisma.accountDeletionCleanup.findUniqueOrThrow({
            where: { userId: user.id },
          })
          assert.equal(job.status, 'blocked')
          assert.equal(job.attempts, 8)
          assert.ok(job.avatarUrl)
          const before = calls
          await processAccountAvatarCleanups({ now: new Date(Date.now() + 864000000) })
          assert.equal(calls, before)
          const restored = await customer()
          await restorePendingCustomerDeletion({ userId: restored.id })
          // Defensive check for a malformed/legacy queued job: ownership state wins.
          await prisma.accountDeletionCleanup.create({
            data: { userId: restored.id, avatarUrl: 'https://storage.fixture.test/not-owned' },
          })
          const outcome = await processAccountAvatarCleanups({ now: new Date(Date.now() + 1000) })
          assert.equal(outcome.blocked, 1)
          assert.equal(calls, before)
          const metrics = await accountDeletionWorkerMetrics()
          assert.ok(metrics.blocked >= 2)
          assert.ok(metrics.oldestCleanupAt)
        }
      )
      await t.test(
        'worker HTTP response and logs report aggregate failures without customer identity',
        async (sub) => {
          const previous = process.env.WORKER_SECRET
          process.env.WORKER_SECRET = 'worker-local-fixture'
          const logs: unknown[] = []
          sub.mock.method(console, 'info', (...args: unknown[]) => logs.push(args))
          try {
            const { POST } = await import('../src/app/api/workers/accounts/anonymize/route')
            assert.equal(
              (
                await POST(
                  new Request('http://localhost/api/workers/accounts/anonymize', { method: 'POST' })
                )
              ).status,
              401
            )
            const request = (query = '') =>
              new Request('http://localhost/api/workers/accounts/anonymize' + query, {
                method: 'POST',
                headers: { authorization: 'Bearer worker-local-fixture' },
              })
            assert.equal((await POST(request('?take=NaN'))).status, 400)
            const response = await POST(request())
            assert.equal(
              response.status,
              503,
              'Blocked cleanup work must surface an operational alert'
            )
            const body = await response.json()
            assert.ok(body.backlog.blocked >= 2)
            assert.equal(typeof body.eligibleBefore, 'number')
            assert.equal(typeof body.processed, 'number')
            assert.ok(body.runId)
            const output = JSON.stringify([body, logs])
            for (const id of ids) assert.equal(output.includes(id), false)
            assert.equal(output.includes('example.test'), false)
            assert.equal(output.includes('worker-local-fixture'), false)
          } finally {
            if (previous === undefined) delete process.env.WORKER_SECRET
            else process.env.WORKER_SECRET = previous
          }
        }
      )
    } finally {
      prisma.user.findMany = findMany
      await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } })
      await prisma.accountDeletionCleanup.deleteMany({ where: { userId: { in: ids } } })
      await prisma.user.deleteMany({ where: { id: { in: ids } } })
      await prisma.$disconnect()
    }
  }
)
