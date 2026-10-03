import test from 'node:test'
import assert from 'node:assert/strict'
import { POST } from '../src/app/api/mobile/v1/driver/push-tokens/route'
import { DELETE } from '../src/app/api/mobile/v1/driver/push-tokens/[installationId]/route'
import { DRIVER_NOTIFICATION_TYPES, driverPushData } from '../src/lib/mobile/notifications'
import { driverPushTokenSchema } from '../src/lib/mobile/pushDevices'

const registration = {
  token: 'fixture-driver-fcm-token-with-enough-length',
  platform: 'android',
  locale: 'fr',
  installationId: 'driver-installation-1',
} as const

test('Driver registration schema is exact and rejects identity or app-scope spoofing', () => {
  assert.equal(driverPushTokenSchema.safeParse(registration).success, true)
  for (const invalid of [
    { ...registration, driverId: 'driver-2' },
    { ...registration, userId: 'user-2' },
    { ...registration, accountId: 'account-2' },
    { ...registration, appType: 'customer' },
    { ...registration, locale: 'fr-BJ' },
    { ...registration, platform: 'web' },
    { ...registration, token: 'short' },
    { ...registration, installationId: 'short' },
  ])
    assert.equal(driverPushTokenSchema.safeParse(invalid).success, false)
})

test('Driver registration and revocation require authenticated Driver sessions', async () => {
  const post = await POST(
    new Request('https://test/api/mobile/v1/driver/push-tokens', {
      method: 'POST',
      body: JSON.stringify(registration),
    })
  )
  const del = await DELETE(new Request('https://test', { method: 'DELETE' }), {
    params: Promise.resolve({ installationId: registration.installationId }),
  })
  assert.equal(post.status, 401)
  assert.equal(del.status, 401)
})

test('Driver notification types and version-1 data payload are frozen', () => {
  assert.deepEqual(DRIVER_NOTIFICATION_TYPES, [
    'admin.message',
    'chat.new_message',
    'trip.driver_assigned',
    'trip.assignment_removed',
    'trip.completed',
    'trip.cancelled',
  ])
  assert.deepEqual(
    driverPushData({
      id: 'notification-1',
      type: 'trip.driver_assigned',
      payload: {
        type: 'trip.driver_assigned',
        version: 1,
        bookingId: 'booking-1',
        bookingLegId: 'leg-1',
        url: 'https://untrusted.example',
      },
    }),
    {
      type: 'trip.driver_assigned',
      version: '1',
      bookingId: 'booking-1',
      bookingLegId: 'leg-1',
      notificationId: 'notification-1',
    }
  )
  assert.deepEqual(driverPushData({ id: 'notification-2', type: 'admin.message', payload: {} }), {
    version: '1',
    type: 'admin.message',
    notificationId: 'notification-2',
  })
  assert.equal(driverPushData({ id: 'notification-3', type: 'trip.started', payload: {} }), null)
})
