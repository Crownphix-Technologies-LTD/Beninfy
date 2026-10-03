import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { issueMobileTokens } from '../src/lib/mobile/auth'
import { createNotificationEvent, deliverNotification } from '../src/lib/mobile/notifications'
import { POST } from '../src/app/api/mobile/v1/driver/push-tokens/route'
import { DELETE } from '../src/app/api/mobile/v1/driver/push-tokens/[installationId]/route'

const url = process.env.CUSTOMER_PUSH_TEST_DATABASE_URL

test(
  'Driver push PostgreSQL ownership, rotation, isolation and invalid-token handling',
  { skip: !url, timeout: 60000 },
  async (t) => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_(dispatch|tour)_test/)
    const originalSecret = process.env.MOBILE_AUTH_SECRET
    process.env.MOBILE_AUTH_SECRET = 'fixture-driver-push-secret'
    const prefix = 'driver-push-' + randomUUID()
    const users = await Promise.all(
      [0, 1].map((index) =>
        prisma.user.create({
          data: { name: prefix + index, email: `${prefix}-${index}@example.test`, role: 'driver' },
        })
      )
    )
    const drivers = await Promise.all(
      users.map((user, index) =>
        prisma.driver.create({
          data: { userId: user.id, name: prefix + index, phone: `+2299700000${index}` },
        })
      )
    )
    async function session(index: number) {
      const tokens = await issueMobileTokens({
        user: users[index],
        principalType: 'DRIVER',
        driverId: drivers[index].id,
        device: { deviceId: prefix + '-auth-' + index, platform: 'android' },
      })
      return {
        headers: {
          Authorization: 'Bearer ' + tokens.accessToken,
          'Content-Type': 'application/json',
        },
      }
    }
    const a = await session(0)
    const b = await session(1)
    const installationX = 'installation-x-' + randomUUID()
    const installationY = 'installation-y-' + randomUUID()
    const token = () => 'fixture-driver-token-' + randomUUID()
    const register = async (
      owner: Awaited<ReturnType<typeof session>>,
      installationId: string,
      fcmToken: string,
      locale: 'en' | 'fr' = 'en'
    ) => {
      const response = await POST(
        new Request('https://test/api/mobile/v1/driver/push-tokens', {
          method: 'POST',
          headers: owner.headers,
          body: JSON.stringify({ token: fcmToken, platform: 'android', locale, installationId }),
        })
      )
      assert.equal(response.status, 200)
      return response.json()
    }
    try {
      await t.test(
        'registration is idempotent and token/locale rotation updates one row',
        async () => {
          const originalToken = token()
          const first = await register(a, installationX, originalToken)
          assert.deepEqual(Object.keys(first), ['registration'])
          assert.equal(first.registration.installationId, installationX)
          assert.equal(first.registration.locale, 'en')
          assert.equal(first.registration.active, true)
          assert.equal(JSON.stringify(first).includes(originalToken), false)
          assert.equal(JSON.stringify(first).includes(users[0].id), false)
          const rotated = await register(a, installationX, token(), 'fr')
          assert.equal(rotated.registration.id, first.registration.id)
          assert.equal(rotated.registration.locale, 'fr')
          assert.equal(
            await prisma.pushDevice.count({
              where: { userId: users[0].id, appType: 'driver', deviceId: installationX },
            }),
            1
          )
        }
      )

      await t.test('multiple installations coexist and A to B transfer is isolated', async () => {
        await register(a, installationY, token())
        assert.equal(
          await prisma.pushDevice.count({
            where: { userId: users[0].id, appType: 'driver', revokedAt: null },
          }),
          2
        )
        await register(b, installationX, token(), 'fr')
        assert.equal(
          await prisma.pushDevice.count({
            where: {
              userId: users[0].id,
              appType: 'driver',
              deviceId: installationX,
              revokedAt: null,
            },
          }),
          0
        )
        assert.equal(
          await prisma.pushDevice.count({
            where: {
              userId: users[1].id,
              appType: 'driver',
              deviceId: installationX,
              revokedAt: null,
            },
          }),
          1
        )
        const foreignDelete = await DELETE(new Request('https://test', { headers: a.headers }), {
          params: Promise.resolve({ installationId: installationX }),
        })
        assert.deepEqual(await foreignDelete.json(), {
          revocation: { installationId: installationX, revoked: false, idempotent: true },
        })
        assert.equal(
          await prisma.pushDevice.count({
            where: {
              userId: users[1].id,
              appType: 'driver',
              deviceId: installationX,
              revokedAt: null,
            },
          }),
          1
        )
      })

      await t.test('revocation is owned and idempotent', async () => {
        const remove = () =>
          DELETE(new Request('https://test', { headers: b.headers }), {
            params: Promise.resolve({ installationId: installationX }),
          })
        assert.deepEqual(await (await remove()).json(), {
          revocation: { installationId: installationX, revoked: true, idempotent: false },
        })
        assert.deepEqual(await (await remove()).json(), {
          revocation: { installationId: installationX, revoked: false, idempotent: true },
        })
      })

      await t.test(
        'invalid Driver token is isolated and notification remains persisted',
        async () => {
          const bad = await prisma.pushDevice.findFirstOrThrow({
            where: { userId: users[0].id, appType: 'driver', deviceId: installationY },
          })
          const notification = await createNotificationEvent({
            userId: users[0].id,
            appType: 'driver',
            type: 'trip.driver_assigned',
            payload: {
              type: 'trip.driver_assigned',
              version: 1,
              bookingId: 'booking-1',
              bookingLegId: 'leg-1',
            },
            dedupeKey: prefix + '-assignment',
          })
          assert.ok(notification)
          await deliverNotification(notification.id, {
            name: 'mock',
            send: async (input) => {
              assert.equal(input.data.notificationId, notification.id)
              return { ok: false, classification: 'invalid_token', errorCode: 'test-invalid' }
            },
          })
          assert.ok(
            (await prisma.pushDevice.findUniqueOrThrow({ where: { id: bad.id } })).invalidatedAt
          )
          assert.ok(await prisma.notification.findUnique({ where: { id: notification.id } }))
        }
      )
    } finally {
      await prisma.notification.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } },
      })
      await prisma.pushDevice.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } },
      })
      await prisma.mobileSession.deleteMany({
        where: { userId: { in: users.map((user) => user.id) } },
      })
      await prisma.driver.deleteMany({ where: { id: { in: drivers.map((driver) => driver.id) } } })
      await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } })
      if (originalSecret === undefined) delete process.env.MOBILE_AUTH_SECRET
      else process.env.MOBILE_AUTH_SECRET = originalSecret
    }
  }
)
