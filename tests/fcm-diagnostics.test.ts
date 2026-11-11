import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import { classifyFcmResponse, getFcmProvider } from '../src/lib/mobile/fcm'
import { logProviderFailureDiagnostic } from '../src/lib/mobile/notifications'

const payload = {
  token: 'fixture-device-token-at-least-twenty-characters',
  title: 'Title',
  body: 'Body',
  data: { type: 'booking.confirmed' },
}

function firebaseError(errorCode: string) {
  return {
    error: {
      details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }],
    },
  }
}

function configureFcm() {
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString()
  process.env.FIREBASE_PROJECT_ID = 'diagnostic-fixture-' + Date.now()
  process.env.FIREBASE_CLIENT_EMAIL = 'fixture@example.test'
  process.env.FIREBASE_PRIVATE_KEY = privateKey
  return privateKey
}

test('FCM diagnostics distinguish safe provider failure stages and codes', async (t) => {
  const previous = { ...process.env }
  t.after(() => {
    for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

  delete process.env.FIREBASE_PROJECT_ID
  const missing = await getFcmProvider().send(payload)
  assert.equal(missing.ok, false)
  if (!missing.ok) {
    assert.equal(missing.classification, 'configuration')
    assert.equal(missing.diagnostic?.stage, 'configuration')
    assert.equal(missing.diagnostic?.providerErrorCode, 'FCM_NOT_CONFIGURED')
  }

  const privateKey = configureFcm()
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { error: 'invalid_grant', error_description: privateKey + payload.token },
      { status: 401, headers: { 'x-request-id': 'oauth-request-1' } }
    )
  )
  const oauth = await getFcmProvider().send(payload)
  assert.equal(oauth.ok, false)
  if (!oauth.ok) {
    assert.equal(oauth.classification, 'configuration')
    assert.deepEqual(oauth.diagnostic, {
      stage: 'oauth',
      httpStatus: 401,
      providerErrorCode: 'invalid_grant',
      correlationId: 'oauth-request-1',
    })
    assert.doesNotMatch(JSON.stringify(oauth), new RegExp(payload.token + '|' + privateKey.slice(30, 60)))
  }
})

test('FCM HTTP classifications retain behavior while exposing allowlisted diagnostics', () => {
  for (const status of [400, 401, 403, 404]) {
    const result = classifyFcmResponse(status, {}, new Headers({ 'x-goog-request-id': 'fcm-1' }))
    assert.equal(result.classification, 'configuration')
    assert.deepEqual(result.diagnostic, {
      stage: 'fcm_http',
      httpStatus: status,
      providerErrorCode: 'UNKNOWN',
      correlationId: 'fcm-1',
    })
  }
  for (const code of ['SENDER_ID_MISMATCH', 'THIRD_PARTY_AUTH_ERROR']) {
    const result = classifyFcmResponse(403, firebaseError(code))
    assert.equal(result.classification, 'configuration')
    assert.equal(result.diagnostic.stage, 'fcm_response')
    assert.equal(result.diagnostic.providerErrorCode, code)
  }
  const unknown = classifyFcmResponse(503, firebaseError('SECRET_PROVIDER_TEXT'))
  assert.equal(unknown.classification, 'transient')
  assert.equal(unknown.diagnostic.stage, 'fcm_http')
  assert.equal(unknown.diagnostic.providerErrorCode, 'UNKNOWN')
})

test('FCM network timeout is sanitized and remains transient', async (t) => {
  const privateKey = configureFcm()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    if (calls === 1) return Response.json({ access_token: 'oauth-secret', expires_in: 3600 })
    const error = new Error(privateKey + payload.token)
    error.name = 'TimeoutError'
    throw error
  })
  const result = await getFcmProvider().send(payload)
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.classification, 'transient')
    assert.equal(result.errorCode, 'FCM_TRANSPORT_FAILED')
    assert.deepEqual(result.diagnostic, {
      stage: 'network',
      providerErrorCode: 'NETWORK_TIMEOUT',
    })
    assert.doesNotMatch(JSON.stringify(result), new RegExp(payload.token + '|' + privateKey.slice(30, 60)))
  }
})

test('diagnostic logging allowlists metadata and can never interrupt delivery', (t) => {
  const entries: unknown[][] = []
  t.mock.method(console, 'info', (...args: unknown[]) => entries.push(args))
  const attemptedAt = new Date('2026-11-11T13:52:16.000Z')
  logProviderFailureDiagnostic({
    notificationId: 'notification-safe-id',
    attemptedAt,
    classification: 'configuration',
    diagnostic: {
      stage: 'fcm_response',
      httpStatus: 403,
      providerErrorCode: 'PRIVATE KEY AND DEVICE TOKEN',
      correlationId: 'Bearer secret',
    },
  })
  assert.equal(entries.length, 1)
  const serialized = JSON.stringify(entries[0])
  assert.match(serialized, /notification-safe-id/)
  assert.match(serialized, /UNKNOWN/)
  assert.doesNotMatch(serialized, /PRIVATE KEY|Bearer secret/)

  t.mock.restoreAll()
  t.mock.method(console, 'info', () => {
    throw new Error('logging unavailable')
  })
  assert.doesNotThrow(() =>
    logProviderFailureDiagnostic({
      notificationId: 'notification-safe-id',
      attemptedAt,
      classification: 'transient',
      diagnostic: { stage: 'network', providerErrorCode: 'NETWORK_ERROR' },
    })
  )
})
