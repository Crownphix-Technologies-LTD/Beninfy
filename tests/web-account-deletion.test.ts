import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import nodemailer from 'nodemailer'
import nextServer from 'next/server'
import { prisma } from '../src/lib/prisma'
import { accountAccessBlocked, accountDeletionGraceDays } from '../src/lib/accountDeletion'
import {
  deletionConfirmSchema,
  deletionRequestAllowed,
  deletionRequestSchema,
  readDeletionBody,
} from '../src/lib/webAccountDeletionHttp'

function request(body: unknown, path = 'request', ip = randomUUID()) {
  return new Request(`https://www.beninfy.com/api/account-deletion/${path}`, {
    method: 'POST',
    headers: {
      Origin: 'https://www.beninfy.com',
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify(body),
  })
}

test('public deletion rejects spoofed identities, malformed codes, cross-site requests and oversized input', async () => {
  assert.equal(
    deletionRequestSchema.safeParse({ email: 'a@example.test', locale: 'en', userId: 'victim' })
      .success,
    false
  )
  assert.equal(
    deletionConfirmSchema.safeParse({
      requestId: randomUUID(),
      code: '12345678',
      confirmation: 'DELETE_MY_ACCOUNT',
      userId: 'victim',
    }).success,
    false
  )
  assert.equal(
    deletionConfirmSchema.safeParse({
      requestId: randomUUID(),
      code: '12345678',
      confirmation: 'yes',
    }).success,
    false
  )
  assert.equal(deletionRequestAllowed(request({})), true)
  assert.equal(
    deletionRequestAllowed(
      new Request('https://www.beninfy.com/api/account-deletion/request', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      })
    ),
    false
  )
  assert.equal(
    deletionRequestAllowed(new Request('https://www.beninfy.com/api/account-deletion/request')),
    false
  )
  assert.equal(await readDeletionBody(request({ input: 'x'.repeat(5000) })), null)
})

test('published grace period follows validated server configuration', () => {
  const prior = process.env.ACCOUNT_DELETION_GRACE_DAYS
  try {
    delete process.env.ACCOUNT_DELETION_GRACE_DAYS
    assert.equal(accountDeletionGraceDays(), 30)
    process.env.ACCOUNT_DELETION_GRACE_DAYS = '14'
    assert.equal(accountDeletionGraceDays(), 14)
    for (const value of ['bad', '-1', '1.5']) {
      process.env.ACCOUNT_DELETION_GRACE_DAYS = value
      assert.throws(accountDeletionGraceDays)
    }
  } finally {
    if (prior === undefined) delete process.env.ACCOUNT_DELETION_GRACE_DAYS
    else process.env.ACCOUNT_DELETION_GRACE_DAYS = prior
  }
})

const url = process.env.WEB_DELETION_TEST_DATABASE_URL
test('website access guard blocks disabled, deletion-pending and anonymized accounts', () => {
  const active = { disabledAt: null, deletionRequestedAt: null, anonymizedAt: null }
  assert.equal(accountAccessBlocked(active), false)
  for (const key of Object.keys(active))
    assert.equal(accountAccessBlocked({ ...active, [key]: new Date() }), true)
})
test(
  'public deletion ownership, abuse controls, atomicity and unchanged mobile/financial contracts',
  { skip: !url, timeout: 90000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_dispatch_test/)
    const environment = {
      SMTP_HOST: 'fixture.invalid',
      SMTP_PORT: '587',
      SMTP_USER: 'fixture',
      SMTP_PASS: 'fixture',
      SMTP_SENDER_EMAIL: 'support@example.test',
      MOBILE_AUTH_SECRET: 'fixture-deletion-hmac-secret',
      ACCOUNT_DELETION_GRACE_DAYS: '30',
    }
    const previous = Object.fromEntries(
      Object.keys(environment).map((key) => [key, process.env[key]])
    )
    Object.assign(process.env, environment)
    const messages: Array<{ to: string; text: string; subject: string }> = []
    let mailFails = false
    t.mock.method(nodemailer, 'createTransport', () => ({
      sendMail: async (message: { to: string; text: string; subject: string }) => {
        if (mailFails) throw new Error('fixture-provider-error-must-not-escape')
        messages.push(message)
        return { messageId: 'fixture' }
      },
    }))
    const tasks: Array<() => Promise<void>> = []
    t.mock.method(nextServer, 'after', (callback: () => Promise<void>) => {
      tasks.push(callback)
    })
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('Live network prohibited')
    })
    const logs: string[] = []
    t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args.join(' ')))
    const service = await import('../src/lib/webAccountDeletion')
    const { POST: requestRoute } = await import('../src/app/api/account-deletion/request/route')
    const { POST: confirmRoute } = await import('../src/app/api/account-deletion/confirm/route')
    const { deleteCustomerAccount } = await import('../src/lib/mobile/customerProduct')
    const users: string[] = []
    const prefix = 'deletion-web-' + randomUUID()
    const vehicle = await prisma.vehicle.create({
      data: { id: prefix, name: 'Deletion fixture', capacity: 4 },
    })
    let bookingId: string | undefined
    async function customer(role = 'user') {
      const user = await prisma.user.create({
        data: {
          email: `${prefix}-${randomUUID()}@example.test`,
          name: 'Synthetic deletion fixture',
          role,
          emailVerified: new Date(),
          phone: '+10000000000',
        },
      })
      users.push(user.id)
      return user
    }
    async function issue(email: string, locale: 'en' | 'fr' = 'en') {
      const requestId = randomUUID()
      await service.sendWebDeletionChallenge({ requestId, email, locale })
      const message = messages.at(-1)
      assert.equal(message?.to, email)
      const code = message!.text.match(/\b\d{8}\b/)![0]
      return { requestId, code }
    }
    try {
      await t.test(
        'same generic response before any lookup/mail for Customer, nonexistent, Admin and Driver emails',
        async () => {
          const known = await customer()
          const admin = await customer('admin')
          const driver = await customer('driver')
          const before = messages.length
          for (const email of [
            known.email!,
            `${prefix}-missing@example.test`,
            admin.email!,
            driver.email!,
          ]) {
            const response = await requestRoute(request({ email, locale: 'en' }))
            assert.equal(response.status, 202)
            assert.equal(response.headers.get('cache-control'), 'no-store')
            const body = await response.json()
            assert.deepEqual(Object.keys(body).sort(), ['ok', 'requestId'])
            assert.match(body.requestId, /^[\da-f-]{36}$/)
            assert.equal(messages.length, before)
          }
          for (const task of tasks.splice(0)) await task()
          assert.equal(messages.length, before + 1)
          const row = await prisma.user.findUniqueOrThrow({ where: { id: known.id } })
          assert.equal(row.deletionRequestedAt, null)
          assert.equal(row.disabledAt, null)
        }
      )
      await t.test(
        'verified confirmation revokes access atomically and preserves booking/payment records',
        async () => {
          const user = await customer()
          const session = await prisma.mobileSession.create({
            data: {
              userId: user.id,
              refreshTokenHash: randomUUID(),
              expiresAt: new Date(Date.now() + 600000),
            },
          })
          await prisma.pushDevice.create({
            data: {
              userId: user.id,
              sessionId: session.id,
              appType: 'customer',
              principalType: 'CUSTOMER',
              platform: 'android',
              token: 'fixture-token',
              tokenHash: randomUUID(),
              deviceId: randomUUID(),
            },
          })
          const booking = await prisma.booking.create({
            data: {
              userId: user.id,
              from: 'Fixture A',
              to: 'Fixture B',
              date: new Date(),
              passengers: 1,
              priceNGN: 100,
              vehicleId: vehicle.id,
              passengerName: 'Synthetic passenger',
              status: 'confirmed',
            },
          })
          bookingId = booking.id
          const payment = await prisma.payment.create({
            data: { bookingId, amountNGN: 100, status: 'paid', reference: randomUUID() },
          })
          const verification = await issue(user.email!)
          const stored = await prisma.otpChallenge.findUniqueOrThrow({
            where: { id: verification.requestId },
          })
          assert.notEqual(stored.codeHash, verification.code)
          assert.match(stored.codeHash, /^[a-f\d]{64}$/)
          assert.equal(stored.maxAttempts, 5)
          assert.ok(stored.expiresAt.getTime() - stored.createdAt.getTime() <= 600000)
          assert.equal(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).disabledAt,
            null
          )
          const response = await confirmRoute(
            request({ ...verification, confirmation: 'DELETE_MY_ACCOUNT' }, 'confirm')
          )
          assert.equal(response.status, 200)
          const body = await response.json()
          assert.equal(body.deletion.status, 'pending')
          assert.equal(body.sessionsRevoked, true)
          assert.equal(
            Date.parse(body.deletion.scheduledAt) - Date.parse(body.deletion.requestedAt),
            30 * 86400000
          )
          const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
          assert.equal(updated.sessionVersion, user.sessionVersion + 1)
          assert.ok(updated.disabledAt)
          assert.ok(
            (await prisma.mobileSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt
          )
          assert.equal(
            await prisma.pushDevice.count({ where: { userId: user.id, revokedAt: null } }),
            0
          )
          assert.deepEqual(await prisma.booking.findUnique({ where: { id: bookingId } }), booking)
          assert.deepEqual(await prisma.payment.findUnique({ where: { id: payment.id } }), payment)
          assert.equal(
            await service.confirmWebAccountDeletion(verification.requestId, verification.code),
            null
          )
          assert.equal(
            await prisma.auditLog.count({
              where: { actorId: user.id, action: 'customer.account.deletion_requested' },
            }),
            1
          )
        }
      )
      await t.test(
        'expiry, five wrong attempts, superseded codes and purpose mismatch cannot delete',
        async () => {
          const user = await customer()
          const expired = await issue(user.email!)
          await prisma.otpChallenge.update({
            where: { id: expired.requestId },
            data: { expiresAt: new Date(0) },
          })
          assert.equal(
            await service.confirmWebAccountDeletion(expired.requestId, expired.code),
            null
          )
          const brute = await issue(user.email!)
          const wrong = brute.code === '00000000' ? '11111111' : '00000000'
          for (let i = 0; i < 5; i++)
            assert.equal(await service.confirmWebAccountDeletion(brute.requestId, wrong), null)
          assert.equal(await service.confirmWebAccountDeletion(brute.requestId, brute.code), null)
          const old = await issue(user.email!)
          const newer = await issue(user.email!)
          assert.equal(await service.confirmWebAccountDeletion(old.requestId, old.code), null)
          await prisma.otpChallenge.update({
            where: { id: newer.requestId },
            data: { purpose: 'customer_email_verification' },
          })
          assert.equal(await service.confirmWebAccountDeletion(newer.requestId, newer.code), null)
          assert.equal(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletionRequestedAt,
            null
          )
        }
      )
      await t.test(
        'email and role changes invalidate ownership proof; codes cannot be swapped between customers',
        async () => {
          const a = await customer()
          const b = await customer()
          const proofA = await issue(a.email!)
          const proofB = await issue(b.email!)
          if (proofA.code !== proofB.code)
            assert.equal(
              await service.confirmWebAccountDeletion(proofA.requestId, proofB.code),
              null
            )
          await prisma.user.update({
            where: { id: a.id },
            data: { email: `${prefix}-changed@example.test` },
          })
          assert.equal(await service.confirmWebAccountDeletion(proofA.requestId, proofA.code), null)
          await prisma.user.update({ where: { id: b.id }, data: { role: 'admin' } })
          assert.equal(await service.confirmWebAccountDeletion(proofB.requestId, proofB.code), null)
        }
      )
      await t.test(
        'simultaneous confirmations consume proof once and create one audit event',
        async () => {
          const user = await customer()
          const proof = await issue(user.email!, 'fr')
          assert.match(messages.at(-1)!.subject, /Confirmez/)
          const results = await Promise.all([
            service.confirmWebAccountDeletion(proof.requestId, proof.code),
            service.confirmWebAccountDeletion(proof.requestId, proof.code),
          ])
          assert.equal(results.filter(Boolean).length, 1)
          assert.equal(
            (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion,
            1
          )
          assert.equal(await prisma.auditLog.count({ where: { actorId: user.id } }), 1)
        }
      )
      await t.test(
        'IP/target throttles, honeypot and origin checks run before deletion',
        async () => {
          const user = await customer()
          const ip = randomUUID()
          const taskCount = tasks.length
          for (let i = 0; i < 5; i++)
            assert.equal(
              (await requestRoute(request({ email: user.email, locale: 'en' }, 'request', ip)))
                .status,
              202
            )
          assert.equal(tasks.length - taskCount, 3)
          assert.equal(
            (await requestRoute(request({ email: user.email, locale: 'en' }, 'request', ip)))
              .status,
            429
          )
          const count = tasks.length
          assert.equal(
            (
              await requestRoute(
                request({ email: 'trap@example.test', locale: 'en', website: 'bot' })
              )
            ).status,
            202
          )
          assert.equal(tasks.length, count)
          const cross = new Request('https://www.beninfy.com/api/account-deletion/confirm', {
            method: 'POST',
            headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
            body: '{}',
          })
          assert.equal((await confirmRoute(cross)).status, 403)
          assert.equal(
            (await requestRoute(request({ email: user.email, locale: 'en', userId: 'spoof' })))
              .status,
            400
          )
          tasks.splice(0)
        }
      )
      await t.test('SMTP failure invalidates proof and logs only a fixed category', async () => {
        const user = await customer()
        const requestId = randomUUID()
        mailFails = true
        try {
          await service.sendWebDeletionChallenge({ requestId, email: user.email!, locale: 'en' })
        } finally {
          mailFails = false
        }
        assert.ok(
          (await prisma.otpChallenge.findUniqueOrThrow({ where: { id: requestId } })).invalidatedAt
        )
        assert.deepEqual(logs, ['account_deletion.email_unavailable'])
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).disabledAt,
          null
        )
      })
      await t.test(
        'mobile password deletion keeps existing proof requirements and pending response',
        async () => {
          const user = await customer()
          await prisma.user.update({
            where: { id: user.id },
            data: { hashedPassword: await bcrypt.hash('fixture-password', 4) },
          })
          const principal = {
            userId: user.id,
            type: 'CUSTOMER' as const,
            email: user.email!,
            role: 'user',
            sessionId: 'fixture',
          }
          const wrong = await deleteCustomerAccount({
            principal,
            confirmation: 'DELETE_MY_ACCOUNT',
            currentPassword: 'wrong',
          })
          assert.equal(wrong.ok, false)
          const result = await deleteCustomerAccount({
            principal,
            confirmation: 'DELETE_MY_ACCOUNT',
            currentPassword: 'fixture-password',
          })
          assert.equal(result.ok, true)
          if (result.ok) {
            assert.equal(result.deletion.status, 'pending')
            assert.equal(
              Date.parse(result.deletion.scheduledAt) - Date.parse(result.deletion.requestedAt),
              30 * 86400000
            )
            const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
            assert.ok(row.disabledAt)
            assert.equal(row.scheduledDeletionAt!.toISOString(), result.deletion.scheduledAt)
            const audits = await prisma.auditLog.findMany({
              where: { entityId: user.id, action: 'customer.account.deletion_requested' },
            })
            assert.equal(audits.length, 1)
            assert.deepEqual(audits[0].metadata, { channel: 'mobile', verification: 'password' })
            assert.equal(audits[0].actorEmail, null)
            assert.equal(audits[0].ipAddress, null)
            const repeat = await deleteCustomerAccount({
              principal,
              confirmation: 'DELETE_MY_ACCOUNT',
              currentPassword: 'fixture-password',
            })
            assert.deepEqual(repeat, result)
            assert.equal(
              await prisma.auditLog.count({
                where: { entityId: user.id, action: 'customer.account.deletion_requested' },
              }),
              1
            )
          }
        }
      )
      await t.test(
        'Google-only mobile deletion still requires recent session activity',
        async () => {
          const user = await customer()
          await prisma.account.create({
            data: {
              userId: user.id,
              type: 'oauth',
              provider: 'google',
              providerAccountId: randomUUID(),
            },
          })
          const old = new Date(Date.now() - 86400000)
          const session = await prisma.mobileSession.create({
            data: {
              userId: user.id,
              refreshTokenHash: randomUUID(),
              createdAt: old,
              lastUsedAt: old,
              expiresAt: new Date(Date.now() + 600000),
            },
          })
          const principal = {
            userId: user.id,
            type: 'CUSTOMER' as const,
            email: user.email!,
            role: 'user',
            sessionId: session.id,
          }
          const stale = await deleteCustomerAccount({
            principal,
            confirmation: 'DELETE_MY_ACCOUNT',
          })
          assert.equal(stale.ok, false)
          if (!stale.ok) assert.equal(stale.code, 'ACCOUNT_REAUTH_REQUIRED')
          await prisma.mobileSession.update({
            where: { id: session.id },
            data: { lastUsedAt: new Date() },
          })
          const fresh = await deleteCustomerAccount({
            principal,
            confirmation: 'DELETE_MY_ACCOUNT',
          })
          assert.equal(fresh.ok, true)
          assert.deepEqual(
            (
              await prisma.auditLog.findFirstOrThrow({
                where: { entityId: user.id, action: 'customer.account.deletion_requested' },
              })
            ).metadata,
            { channel: 'mobile', verification: 'recent_session' }
          )
          if (fresh.ok) {
            assert.equal(
              Date.parse(fresh.deletion.scheduledAt) - Date.parse(fresh.deletion.requestedAt),
              30 * 86400000
            )
            assert.ok(
              (await prisma.mobileSession.findUniqueOrThrow({ where: { id: session.id } }))
                .revokedAt
            )
          }
        }
      )
      await t.test(
        'mobile audit failure rolls back account disabling and session revocation',
        async () => {
          const user = await customer()
          await prisma.user.update({
            where: { id: user.id },
            data: { hashedPassword: await bcrypt.hash('fixture-password', 4) },
          })
          const session = await prisma.mobileSession.create({
            data: {
              userId: user.id,
              refreshTokenHash: randomUUID(),
              expiresAt: new Date(Date.now() + 600000),
            },
          })
          const transaction = prisma.$transaction.bind(prisma)
          try {
            prisma.$transaction = ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
              transaction(async (tx) => {
                tx.auditLog.create = (() => {
                  throw new Error('Synthetic audit unavailable')
                }) as typeof tx.auditLog.create
                return callback(tx)
              })) as typeof prisma.$transaction
            await assert.rejects(
              deleteCustomerAccount({
                principal: {
                  userId: user.id,
                  type: 'CUSTOMER',
                  email: user.email!,
                  role: 'user',
                  sessionId: session.id,
                },
                confirmation: 'DELETE_MY_ACCOUNT',
                currentPassword: 'fixture-password',
              }),
              /Synthetic audit unavailable/
            )
          } finally {
            prisma.$transaction = transaction
          }
          const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
          assert.equal(unchanged.disabledAt, null)
          assert.equal(unchanged.deletionRequestedAt, null)
          assert.equal(unchanged.sessionVersion, 0)
          assert.equal(
            (await prisma.mobileSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
            null
          )
        }
      )
    } finally {
      if (bookingId) {
        await prisma.payment.deleteMany({ where: { bookingId } })
        await prisma.booking.delete({ where: { id: bookingId } })
      }
      await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } })
      await prisma.user.deleteMany({ where: { id: { in: users } } })
      await prisma.vehicle.delete({ where: { id: vehicle.id } })
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      await prisma.$disconnect()
    }
  }
)
