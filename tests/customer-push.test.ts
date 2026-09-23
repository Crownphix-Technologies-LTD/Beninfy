import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { getFcmProvider, classifyFcmResponse } from '../src/lib/mobile/fcm'
import { customerPushData, getPushProvider, templateFor } from '../src/lib/mobile/notifications'
import { customerPushTokenSchema } from '../src/lib/mobile/pushDevices'
import { POST } from '../src/app/api/mobile/v1/customer/push-tokens/route'
import { DELETE } from '../src/app/api/mobile/v1/customer/push-tokens/[installationId]/route'

const payload = {
  token: 'fixture-token-with-enough-length',
  title: 'Update',
  body: 'Open the app',
  data: { type: 'booking.confirmed' },
}

test('Customer registration schema rejects user spoofing, arbitrary app identity and malformed tokens', () => {
  const base = {
    token: payload.token,
    platform: 'android',
    installationId: 'install-1',
    locale: 'fr-BJ',
  }
  assert.equal(customerPushTokenSchema.safeParse(base).success, true)
  for (const invalid of [
    { ...base, userId: 'other' },
    { ...base, appType: 'driver' },
    { ...base, token: 'short' },
    { ...base, token: 'spaces are not valid token data' },
    { ...base, platform: 'web' },
    { ...base, installationId: '' },
  ])
    assert.equal(customerPushTokenSchema.safeParse(invalid).success, false)
})

test('registration and revocation reject unauthenticated requests before touching storage', async () => {
  const post = await POST(
    new Request('https://test/api/mobile/v1/customer/push-tokens', { method: 'POST' })
  )
  const del = await DELETE(new Request('https://test', { method: 'DELETE' }), {
    params: Promise.resolve({ installationId: 'any' }),
  })
  assert.equal(post.status, 401)
  assert.equal(del.status, 401)
})

test('Ride and Tour payloads contain only whitelisted routing keys and notification identity', () => {
  for (const [type, entityType, ids] of [
    ['trip.driver_assigned', 'ride', { bookingId: 'ride-1' }],
    ['tour.payment_confirmed', 'tour', { tourBookingId: 'tour-1' }],
  ] as const) {
    assert.deepEqual(
      customerPushData({
        id: 'notification-1',
        type,
        payload: { ...ids, url: 'https://evil', authToken: 'secret', amount: 99999 },
      }),
      {
        version: '1',
        type,
        entityType,
        entityId: entityType === 'ride' ? 'ride-1' : 'tour-1',
        notificationId: 'notification-1',
      }
    )
  }
  assert.equal(customerPushData({ id: 'n', type: 'arbitrary', payload: { bookingId: 'b' } }), null)
  assert.equal(
    customerPushData({
      id: 'n',
      type: 'booking.confirmed',
      payload: { bookingId: 'https://evil' },
    }),
    null
  )
})

test('FCM cleanup requires a token-specific error and never treats a generic 400/404 as an invalid device', () => {
  const fcmError = (errorCode: string) => ({
    error: {
      details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }],
    },
  })
  assert.equal(classifyFcmResponse(404, fcmError('UNREGISTERED')).classification, 'invalid_token')
  assert.equal(
    classifyFcmResponse(400, fcmError('INVALID_ARGUMENT')).classification,
    'invalid_token'
  )
  assert.equal(classifyFcmResponse(400, {}).classification, 'configuration')
  assert.equal(classifyFcmResponse(404, {}).classification, 'configuration')
  assert.equal(
    classifyFcmResponse(403, fcmError('SENDER_ID_MISMATCH')).classification,
    'configuration'
  )
  assert.equal(
    classifyFcmResponse(401, fcmError('THIRD_PARTY_AUTH_ERROR')).classification,
    'configuration'
  )
  assert.equal(classifyFcmResponse(429, {}).classification, 'transient')
  assert.equal(classifyFcmResponse(503, {}).classification, 'transient')
})

test('missing FCM configuration and production mock/disabled modes never claim real delivery', async (t) => {
  const previous = { ...process.env }
  t.after(() => {
    for (const key of [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'PUSH_PROVIDER',
      'NODE_ENV',
    ]) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })
  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('No live provider calls allowed')
  })
  delete process.env.FIREBASE_PROJECT_ID
  const missing = await getFcmProvider().send(payload)
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.equal(missing.classification, 'configuration')
  Object.assign(process.env, { NODE_ENV: 'production' })
  for (const mode of ['mock', 'disabled']) {
    process.env.PUSH_PROVIDER = mode
    assert.equal((await getPushProvider().send(payload)).ok, false)
  }
})

test('FCM HTTP v1 uses server OAuth and Android/APNs payloads; provider errors are sanitized', async (t) => {
  const previous = { ...process.env }
  t.after(() => {
    for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString()
  process.env.FIREBASE_PROJECT_ID = 'fixture-project'
  process.env.FIREBASE_CLIENT_EMAIL = 'fixture@example.test'
  process.env.FIREBASE_PRIVATE_KEY = key
  let sends = 0
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    if (String(url).includes('oauth2.googleapis.com'))
      return Response.json({ access_token: 'fixture-oauth-secret', expires_in: 3600 })
    assert.equal(
      String(url),
      'https://fcm.googleapis.com/v1/projects/fixture-project/messages:send'
    )
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-oauth-secret')
    const body = JSON.parse(String(init?.body))
    assert.equal(body.message.token, payload.token)
    assert.equal(body.message.apns.headers['apns-push-type'], 'alert')
    assert.equal(body.message.android.priority, 'HIGH')
    assert.equal(String(init?.body).includes('fixture-oauth-secret'), false)
    assert.equal(String(init?.body).includes(key), false)
    if (++sends === 2) throw new Error(payload.token + ' PRIVATE SECRET')
    return Response.json({ name: 'projects/fixture-project/messages/fixture' })
  })
  assert.equal((await getFcmProvider().send(payload)).ok, true)
  const failed = await getFcmProvider().send(payload)
  assert.deepEqual(failed, {
    ok: false,
    classification: 'transient',
    errorCode: 'FCM_TRANSPORT_FAILED',
  })
})

test('Customer Tour templates provide EN/FR lock-screen copy without operational/payment details', () => {
  assert.equal(
    templateFor('tour.booking_confirmed', 'fr', 'customer')?.title,
    'Circuit confirm\u00e9'
  )
  for (const type of [
    'tour.booking_confirmed',
    'tour.payment_confirmed',
    'tour.cancelled',
    'tour.status_updated',
  ] as const) {
    assert.ok(templateFor(type, 'en', 'customer')?.title)
    assert.doesNotMatch(JSON.stringify(templateFor(type, 'fr', 'customer')), /[?\uFFFD]/)
    assert.notEqual(
      templateFor(type, 'en', 'customer')?.title,
      templateFor(type, 'fr', 'customer')?.title
    )
  }
})
