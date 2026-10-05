import assert from 'node:assert/strict'
import test from 'node:test'
import { safeGoogleVerificationDiagnostic } from '@/lib/mobile/googleAuthDiagnostics'

const claims = {
  aud: 'fixture-native-client',
  azp: 'fixture-native-client',
  iss: 'https://accounts.google.com',
  exp: Math.floor(Date.now() / 1000) + 3600,
  email: 'private-fixture@example.test',
  email_verified: true,
  sub: 'private-fixture-subject',
}

function tokenFor(value: Record<string, unknown>) {
  return `fixture.${Buffer.from(JSON.stringify(value)).toString('base64url')}.signature`
}

function diagnose(value: Record<string, unknown>, token = tokenFor(value)) {
  return safeGoogleVerificationDiagnostic({
    token,
    audiences: ['fixture-native-client'],
    iosClient: 'fixture-native-client',
    reason: 'provider_rejected',
  })
}

test('Google diagnostics never expose identity or credential values', () => {
  const token = tokenFor(claims)
  const output = JSON.stringify(diagnose(claims, token))

  for (const privateValue of [token, claims.aud, claims.email, claims.sub]) {
    assert.equal(output.includes(privateValue), false)
  }
})

test('Google diagnostics expose only safe claim checks', () => {
  assert.deepEqual(diagnose(claims), {
    event: 'mobile_google_verification_failed',
    reason: 'provider_rejected',
    providerStatus: null,
    metadataSource: 'unverified_token_payload',
    malformedCredential: false,
    audienceAllowed: true,
    authorizedPartyPresent: true,
    authorizedPartyMatchesIosClient: true,
    issuerValid: true,
    expiryValid: true,
    subjectPresent: true,
    emailPresent: true,
    emailVerified: true,
    signatureJwkDiagnostic: 'not_available',
  })
})

test('Google diagnostics distinguish safe rejection categories', () => {
  assert.equal(diagnose({ ...claims, aud: 'other' }).audienceAllowed, false)
  assert.equal(diagnose({ ...claims, iss: 'other' }).issuerValid, false)
  assert.equal(diagnose({ ...claims, exp: 1 }).expiryValid, false)
  assert.equal(diagnose({ ...claims, sub: '' }).subjectPresent, false)
  assert.equal(diagnose({ ...claims, email: '' }).emailPresent, false)
  assert.equal(diagnose({ ...claims, email_verified: false }).emailVerified, false)
})

test('malformed Google credentials produce no inferred claim values', () => {
  const diagnostic = diagnose(claims, 'intentionally-invalid')

  assert.equal(diagnostic.malformedCredential, true)
  assert.equal(diagnostic.audienceAllowed, null)
  assert.equal(diagnostic.subjectPresent, null)
  assert.equal(diagnostic.emailPresent, null)
})
