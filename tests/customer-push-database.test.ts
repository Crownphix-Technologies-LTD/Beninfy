import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { prisma } from '../src/lib/prisma'
import {
  issueMobileTokens,
  requireMobilePrincipal,
  revokeMobileRefreshToken,
} from '../src/lib/mobile/auth'
import { logoutAllMobileSessions } from '../src/lib/mobile/customerAccount'
import { registerPushDevice } from '../src/lib/mobile/pushDevices'
import {
  createNotificationEvent,
  deliverNotification,
  processDueNotificationDeliveries,
  notifyAssignmentPush,
  notifyTripLifecyclePush,
  notifyTourDayPush,
  type PushNotificationProvider,
} from '../src/lib/mobile/notifications'
import {
  markPaymentPaidAndConfirmTourBooking,
  markPaymentPaidAndReserveBooking,
} from '../src/lib/paymentSettlement'
import { cancelCustomerTourBooking } from '../src/lib/mobile/tourBookings'
import { POST } from '../src/app/api/mobile/v1/customer/push-tokens/route'
import { DELETE } from '../src/app/api/mobile/v1/customer/push-tokens/[installationId]/route'
import { GET as inbox } from '../src/app/api/mobile/v1/notifications/route'

const url = process.env.CUSTOMER_PUSH_TEST_DATABASE_URL

test(
  'Customer push PostgreSQL API, account isolation, durable fanout and lifecycle integration',
  { skip: !url, timeout: 90000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_(dispatch|tour)_test/)
    const originalSecret = process.env.MOBILE_AUTH_SECRET
    process.env.MOBILE_AUTH_SECRET = 'fixture-push-auth-secret-only'
    const logs: string[] = []
    t.mock.method(console, 'info', (...args: unknown[]) => {
      logs.push(JSON.stringify(args))
    })
    t.mock.method(globalThis, 'fetch', async () => {
      assert.fail('Live network is prohibited in push tests')
    })
    const prefix = 'push-' + randomUUID()
    const users = await Promise.all(
      [0, 1].map((index) =>
        prisma.user.create({
          data: { name: prefix + index, email: `${prefix}-${index}@example.test` },
        })
      )
    )
    const userIds = users.map((user) => user.id)
    const tokens: string[] = []
    const success: PushNotificationProvider = {
      name: 'mock',
      send: async () => ({ ok: true, providerMessageId: 'mock-message' }),
    }
    async function session(user = 0, deviceId = 'install-' + randomUUID()) {
      const auth = await issueMobileTokens({
        user: users[user],
        principalType: 'CUSTOMER',
        device: { deviceId, platform: 'android' },
      })
      const headers = {
        Authorization: 'Bearer ' + auth.accessToken,
        'Content-Type': 'application/json',
      }
      const guard = await requireMobilePrincipal(
        new Request('https://test', { headers }),
        'CUSTOMER'
      )
      assert.ok(guard.ok)
      return { ...auth, headers, principal: guard.principal, installationId: deviceId }
    }
    const a = await session(0)
    const b = await session(1)
    async function register(
      owner = a,
      options: { token?: string; installationId?: string; language?: string } = {}
    ) {
      const token = options.token ?? 'fixture-token-' + randomUUID()
      tokens.push(token)
      const result = await registerPushDevice({
        principal: owner.principal,
        input: {
          token,
          platform: 'android',
          appType: 'customer',
          deviceId: options.installationId ?? owner.installationId,
          language: options.language ?? 'en',
        },
      })
      assert.ok(result.ok)
      return result.device
    }
    async function event(owner = a, key = randomUUID()) {
      const result = await createNotificationEvent({
        userId: owner.principal.userId,
        appType: 'customer',
        type: 'trip.started',
        payload: { type: 'trip.started', version: 1, bookingId: 'fixture-ride' },
        dedupeKey: prefix + key,
      })
      assert.ok(result)
      return result
    }
    async function reset() {
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.pushDevice.deleteMany({ where: { userId: { in: userIds } } })
    }
    await prisma.vehicle.create({ data: { id: prefix, name: 'Fixture category', capacity: 4 } })
    await prisma.tour.create({
      data: {
        id: prefix,
        title: 'Fixture Tour',
        country: 'Test',
        description: 'Test',
        durationDays: 1,
        startingFromNGN: 1000,
      },
    })
    const driver = await prisma.driver.create({ data: { name: prefix, phone: 'fixture' } })
    const tourFixture = () =>
      prisma.tourBooking.create({
        data: {
          userId: users[0].id,
          tourId: prefix,
          reference: 'fixture-' + randomUUID(),
          priceNGN: 1000,
          tourTitle: 'Fixture Tour',
          tourCountry: 'Test',
          startDate: new Date('2099-01-01'),
          endDate: new Date('2099-01-01'),
          travellers: 1,
          days: {
            create: { dayNumber: 1, title: 'Fixture day', scheduledDate: new Date('2099-01-01') },
          },
        },
        include: { days: true },
      })
    try {
      await t.test(
        'authenticated Customer API registers idempotently and never returns token/user/session secrets',
        async () => {
          const token = 'fixture-api-token-' + randomUUID()
          tokens.push(token)
          const body = { token, platform: 'ios', locale: 'fr-BJ', installationId: a.installationId }
          const post = () =>
            POST(
              new Request('https://test/api/mobile/v1/customer/push-tokens', {
                method: 'POST',
                headers: a.headers,
                body: JSON.stringify(body),
              })
            )
          const response = await post()
          assert.equal(response.status, 200)
          const json = await response.json()
          assert.equal(json.installation.locale, 'fr')
          assert.equal(JSON.stringify(json).includes(token), false)
          assert.equal(JSON.stringify(json).includes(users[0].id), false)
          const again = await (await post()).json()
          assert.equal(again.installation.id, json.installation.id)
          assert.equal(await prisma.pushDevice.count({ where: { userId: users[0].id } }), 1)
        }
      )
      await t.test(
        'spoofed userId is rejected and no installation enumeration API exists',
        async () => {
          const response = await POST(
            new Request('https://test', {
              method: 'POST',
              headers: a.headers,
              body: JSON.stringify({
                token: 'fixture-token-with-enough-length',
                platform: 'android',
                installationId: 'spoof',
                userId: users[1].id,
              }),
            })
          )
          assert.equal(response.status, 400)
          assert.equal(await prisma.pushDevice.count({ where: { userId: users[1].id } }), 0)
          const routes = await import('../src/app/api/mobile/v1/customer/push-tokens/route')
          assert.equal('GET' in routes, false)
        }
      )
      await t.test(
        'concurrent upserts and token rotation reconcile installation/token collisions without accumulating duplicates',
        async () => {
          await reset()
          const token = 'fixture-concurrent-' + randomUUID()
          const results = await Promise.all([register(a, { token }), register(a, { token })])
          assert.equal(results[0].id, results[1].id)
          const rotated = await register(a)
          assert.equal(rotated.id, results[0].id)
          assert.notEqual(rotated.token, token)
          const looseToken = 'fixture-loose-' + randomUUID()
          const loose = await registerPushDevice({
            principal: a.principal,
            input: { token: looseToken, platform: 'android', appType: 'customer' },
          })
          assert.ok(loose.ok)
          await register(a, { token: looseToken })
          assert.equal(await prisma.pushDevice.count({ where: { userId: users[0].id } }), 1)
        }
      )
      await t.test(
        'A logout/revoke then B registration transfers the token and blocks old queued A notifications',
        async () => {
          await reset()
          const original = await register(a)
          const queued = await event(a)
          const revoke = () =>
            DELETE(new Request('https://test', { method: 'DELETE', headers: a.headers }), {
              params: Promise.resolve({ installationId: a.installationId }),
            })
          assert.equal((await revoke()).status, 200)
          assert.equal((await revoke()).status, 200)
          const moved = await register(b, {
            token: original.token,
            installationId: a.installationId,
          })
          assert.equal(moved.userId, users[1].id)
          assert.equal((await revoke()).status, 200) // Cannot revoke B, or reveal B's existence.
          assert.equal(
            (await prisma.pushDevice.findUniqueOrThrow({ where: { id: moved.id } })).revokedAt,
            null
          )
          let calls = 0
          await deliverNotification(queued.id, {
            name: 'mock',
            send: async () => {
              calls++
              return { ok: true }
            },
          })
          assert.equal(calls, 0)
          assert.equal(
            await prisma.pushDevice.count({
              where: { tokenHash: original.tokenHash, revokedAt: null, invalidatedAt: null },
            }),
            1
          )
        }
      )
      await t.test(
        'account transfer retires failed retries without sending the old account notification',
        async () => {
          await reset()
          const original = await register(a)
          const queued = await event(a)
          await deliverNotification(queued.id, {
            name: 'mock',
            send: async () => ({ ok: false, classification: 'transient', errorCode: 'TEST' }),
          })
          await register(b, { token: original.token, installationId: a.installationId })
          let calls = 0
          await deliverNotification(queued.id, {
            name: 'mock',
            send: async () => {
              calls++
              return { ok: true }
            },
          })
          assert.equal(calls, 0)
          const delivery = await prisma.notificationDelivery.findFirstOrThrow({
            where: { notificationId: queued.id },
          })
          assert.equal(delivery.status, 'skipped')
          assert.equal(delivery.nextAttemptAt, null)
        }
      )
      await t.test(
        'same installation with a different token revokes the previous account association',
        async () => {
          await reset()
          const original = await register(a)
          await register(b, { installationId: a.installationId })
          assert.ok(
            (await prisma.pushDevice.findUniqueOrThrow({ where: { id: original.id } })).revokedAt
          )
        }
      )
      await t.test(
        'ownership transfer waits for in-flight send; subsequent A dispatch cannot target B',
        async () => {
          await reset()
          const original = await register(a)
          const queued = await event(a)
          let release!: () => void
          let entered!: () => void
          const gate = new Promise<void>((resolve) => {
            release = resolve
          })
          const started = new Promise<void>((resolve) => {
            entered = resolve
          })
          const sending = deliverNotification(queued.id, {
            name: 'mock',
            send: async () => {
              entered()
              await gate
              return { ok: true }
            },
          })
          await started
          let completed = false
          const transfer = register(b, {
            token: original.token,
            installationId: a.installationId,
          }).then((value) => {
            completed = true
            return value
          })
          await delay(30)
          try {
            assert.equal(completed, false)
          } finally {
            release()
          }
          await Promise.all([sending, transfer])
          let attempts = 0
          await deliverNotification((await event(a)).id, {
            name: 'mock',
            send: async () => {
              attempts++
              return { ok: true }
            },
          })
          assert.equal(attempts, 0)
        }
      )
      await t.test(
        'multi-device fanout isolates invalid/throwing tokens and localizes each active device',
        async () => {
          await reset()
          const en = await register(a, { installationId: 'en-device' })
          const fr = await register(a, { installationId: 'fr-device', language: 'fr' })
          const bad = await register(a, { installationId: 'bad-device' })
          const flaky = await register(a, { installationId: 'flaky-device' })
          const notification = await event(a)
          const sent: Array<{ token: string; title: string }> = []
          await deliverNotification(notification.id, {
            name: 'mock',
            send: async (input) => {
              if (input.token === bad.token)
                return { ok: false, classification: 'invalid_token', errorCode: bad.token }
              if (input.token === flaky.token) throw new Error(flaky.token)
              sent.push(input)
              return { ok: true }
            },
          })
          assert.equal(sent.length, 2)
          assert.equal(sent.find((item) => item.token === en.token)?.title, 'Trip started')
          assert.equal(sent.find((item) => item.token === fr.token)?.title, 'Trajet commence')
          assert.ok(
            (await prisma.pushDevice.findUniqueOrThrow({ where: { id: bad.id } })).invalidatedAt
          )
          const failed = await prisma.notificationDelivery.findFirstOrThrow({
            where: { notificationId: notification.id, pushDeviceId: flaky.id },
          })
          assert.equal(failed.errorCode, 'transient')
          let retries = 0
          const provider: PushNotificationProvider = {
            name: 'mock',
            send: async () => {
              retries++
              return { ok: true }
            },
          }
          await deliverNotification(notification.id, provider)
          assert.equal(retries, 0)
          await prisma.notificationDelivery.update({
            where: { id: failed.id },
            data: { nextAttemptAt: new Date(0) },
          })
          await deliverNotification(notification.id, provider)
          assert.equal(retries, 1)
          assert.ok(await prisma.notification.findUnique({ where: { id: notification.id } }))
        }
      )
      await t.test(
        'persisted inbox is authoritative and worker retries do not duplicate one domain event',
        async () => {
          await reset()
          await register(a)
          const key = randomUUID()
          const [first, second] = await Promise.all([event(a, key), event(a, key)])
          assert.equal(first.id, second.id)
          assert.equal(
            await prisma.notificationDelivery.count({ where: { notificationId: first.id } }),
            0
          )
          let sends = 0
          const provider: PushNotificationProvider = {
            name: 'mock',
            send: async () => {
              sends++
              await delay(10)
              return { ok: true }
            },
          }
          await Promise.all([
            deliverNotification(first.id, provider),
            deliverNotification(first.id, provider),
          ])
          assert.equal(sends, 1)
          await processDueNotificationDeliveries({ provider })
          assert.equal(sends, 1)
          const own = await (
            await inbox(
              new Request('https://test/api/mobile/v1/notifications', { headers: a.headers })
            )
          ).json()
          const other = await (
            await inbox(
              new Request('https://test/api/mobile/v1/notifications', { headers: b.headers })
            )
          ).json()
          assert.ok(own.notifications.some((item: { id: string }) => item.id === first.id))
          assert.equal(
            other.notifications.some((item: { id: string }) => item.id === first.id),
            false
          )
        }
      )
      await t.test(
        'configuration failures remain blocked and recover through the existing worker',
        async () => {
          await reset()
          await register(a)
          const item = await event(a)
          await deliverNotification(item.id, {
            name: 'disabled',
            send: async () => ({
              ok: false,
              classification: 'configuration',
              errorCode: 'missing',
            }),
          })
          assert.equal(
            (await prisma.notification.findUniqueOrThrow({ where: { id: item.id } })).deliveryState,
            'blocked'
          )
          await prisma.notificationDelivery.updateMany({
            where: { notificationId: item.id },
            data: { nextAttemptAt: new Date(0) },
          })
          await processDueNotificationDeliveries({ provider: success })
          assert.equal(
            (await prisma.notification.findUniqueOrThrow({ where: { id: item.id } })).deliveryState,
            'sent'
          )
        }
      )
      await t.test(
        'single-session logout and logout-all revoke installations and reject stale-session registration',
        async () => {
          await reset()
          const login = await session(0)
          const row = await register(login)
          await revokeMobileRefreshToken(login.refreshToken)
          await revokeMobileRefreshToken(login.refreshToken)
          assert.ok(
            (await prisma.pushDevice.findUniqueOrThrow({ where: { id: row.id } })).revokedAt
          )
          const stale = await registerPushDevice({
            principal: login.principal,
            input: {
              token: row.token,
              platform: 'android',
              appType: 'customer',
              deviceId: login.installationId,
            },
          })
          assert.equal(stale.ok, false)
          await register(a)
          await logoutAllMobileSessions(a.principal)
          assert.equal(
            await prisma.pushDevice.count({ where: { userId: users[0].id, revokedAt: null } }),
            0
          )
          // Continue fixture operations with a fresh authoritative session.
          users[0] = await prisma.user.findUniqueOrThrow({ where: { id: users[0].id } })
          Object.assign(a, await session(0))
        }
      )
      await t.test(
        'Ride settlement, assignment, arrived/start/complete/cancel events persist and tolerate provider failure',
        async () => {
          await reset()
          await register(a)
          const booking = await prisma.booking.create({
            data: {
              userId: users[0].id,
              from: 'Fixture A',
              to: 'Fixture B',
              date: new Date('2099-01-01'),
              vehicleId: prefix,
              passengers: 1,
              priceNGN: 1000,
              legs: {
                create: {
                  direction: 'outbound',
                  from: 'Fixture A',
                  to: 'Fixture B',
                  departureDate: new Date('2099-01-01'),
                  vehicleId: prefix,
                  status: 'payment_pending',
                  driverId: driver.id,
                  assignedAt: new Date(),
                },
              },
            },
            include: { legs: true },
          })
          const payment = await prisma.payment.create({
            data: {
              bookingId: booking.id,
              amountNGN: 1000,
              status: 'pending',
              reference: randomUUID(),
              provider: 'fixture',
            },
          })
          const settle = () =>
            markPaymentPaidAndReserveBooking({
              bookingId: booking.id,
              paymentId: payment.id,
              paymentData: {},
            })
          assert.equal((await settle()).ok, true)
          assert.equal((await settle()).ok, true)
          await notifyAssignmentPush({ bookingLegId: booking.legs[0].id })
          await notifyAssignmentPush({ bookingLegId: booking.legs[0].id })
          for (const nextStatus of ['driver_arrived', 'in_progress', 'completed', 'cancelled']) {
            const args = { bookingId: booking.id, bookingLegId: booking.legs[0].id, nextStatus }
            await notifyTripLifecyclePush(args)
            await notifyTripLifecyclePush(args)
          }
          const notices = await prisma.notification.findMany({ where: { userId: users[0].id } })
          assert.equal(notices.length, 6)
          assert.ok(notices.some((item) => item.type === 'trip.driver_assigned'))
          for (const item of notices)
            await deliverNotification(item.id, {
              name: 'mock',
              send: async () => {
                throw new Error('fixture provider failure')
              },
            })
          assert.equal(
            (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
            'confirmed'
          )
          assert.equal(
            (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status,
            'paid'
          )
          assert.equal(await prisma.notification.count({ where: { userId: users[0].id } }), 6)
        }
      )
      await t.test(
        'Tour settlement, cancellation and operational events use one safe booking target and dedupe repeats',
        async () => {
          await reset()
          await register(a)
          const tour = await tourFixture()
          const payment = await prisma.payment.create({
            data: {
              tourBookingId: tour.id,
              amountNGN: 1000,
              status: 'pending',
              reference: randomUUID(),
              provider: 'fixture',
            },
          })
          const settle = () =>
            markPaymentPaidAndConfirmTourBooking({
              paymentId: payment.id,
              tourBookingId: tour.id,
              amountNGN: 1000,
              provider: 'fixture',
              paymentData: {},
            })
          assert.equal((await settle()).ok, true)
          assert.equal((await settle()).ok, true)
          const pending = await tourFixture()
          const cancel = () =>
            cancelCustomerTourBooking({ principal: a.principal, tourBookingId: pending.id })
          assert.equal((await cancel()).ok, true)
          assert.equal((await cancel()).ok, true)
          const day = { ...tour.days[0], tourBooking: { user: { id: users[0].id } } }
          await notifyTourDayPush(day, 'start_day')
          await notifyTourDayPush(day, 'start_day')
          const notices = await prisma.notification.findMany({ where: { userId: users[0].id } })
          assert.deepEqual(notices.map((item) => item.type).sort(), [
            'tour.cancelled',
            'tour.payment_confirmed',
            'tour.status_updated',
          ])
          for (const item of notices) await deliverNotification(item.id, success)
          assert.equal(
            (await prisma.tourBooking.findUniqueOrThrow({ where: { id: tour.id } })).paymentStatus,
            'paid'
          )
          assert.equal(
            (await prisma.tourBooking.findUniqueOrThrow({ where: { id: pending.id } })).status,
            'cancelled'
          )
        }
      )
      await t.test(
        'sanitized operational logs never contain raw tokens or authentication material',
        () => {
          const output = logs.join('\n')
          for (const token of [...tokens, a.accessToken, a.refreshToken, b.accessToken])
            assert.equal(output.includes(token), false)
          assert.ok(output.includes('push.registered'))
          assert.ok(output.includes('push.dispatch_attempted'))
          assert.ok(output.includes('push.dispatch_result'))
          assert.ok(output.includes('push.invalid_token_cleanup'))
        }
      )
    } finally {
      await prisma.payment.deleteMany({
        where: {
          OR: [
            { booking: { userId: { in: userIds } } },
            { tourBooking: { userId: { in: userIds } } },
          ],
        },
      })
      await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.tourBooking.deleteMany({ where: { userId: { in: userIds } } })
      await prisma.tour.delete({ where: { id: prefix } })
      await prisma.driver.delete({ where: { id: driver.id } })
      await prisma.vehicle.delete({ where: { id: prefix } })
      await prisma.user.deleteMany({ where: { id: { in: userIds } } })
      if (originalSecret === undefined) delete process.env.MOBILE_AUTH_SECRET
      else process.env.MOBILE_AUTH_SECRET = originalSecret
      await prisma.$disconnect()
    }
  }
)
