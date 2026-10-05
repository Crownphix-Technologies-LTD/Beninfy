import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  customerOtpPolicy,
  maskCustomerOtpDestination,
  normalizeCustomerAuthEmail,
} from '../src/lib/mobile/customerOtpAuth'
import { normalizeMobilePhone } from '../src/lib/mobile/onboarding'

const read = (path: string) => readFileSync(path, 'utf8')

test('Customer OTP policy is frozen at six digits, five minutes, five attempts and 60 seconds', () => {
  assert.deepEqual(customerOtpPolicy(), {
    codeLength: 6,
    expiresIn: 300,
    resendAfter: 60,
    maxAttempts: 5,
  })
})

test('Customer OTP normalizes email and masks email and international SMS destinations', () => {
  assert.equal(normalizeCustomerAuthEmail('  James@Example.COM '), 'james@example.com')
  assert.equal(maskCustomerOtpDestination('email', 'james@example.com'), 'ja•••@example.com')
  assert.equal(maskCustomerOtpDestination('sms', '+22951010405'), '+229 •••• 0405')
  assert.equal(normalizeMobilePhone('+229 51 01 04 05'), '+22951010405')
  assert.equal(normalizeMobilePhone('+234 801 234 5678'), '+2348012345678')
  assert.equal(normalizeMobilePhone('+228 90 12 34 56'), '+22890123456')
  assert.equal(normalizeMobilePhone('+233 20 123 4567'), '+233201234567')
})

test('Customer OTP routes expose only opaque challenge contracts and never return OTP codes', () => {
  const routes = [
    'src/app/api/mobile/v1/auth/otp/start/route.ts',
    'src/app/api/mobile/v1/auth/otp/resend/route.ts',
    'src/app/api/mobile/v1/auth/otp/verify/route.ts',
    'src/app/api/mobile/v1/auth/otp/signup/route.ts',
  ].map(read)
  assert.match(routes[0], /startCustomerOtp/)
  assert.match(routes[1], /resendCustomerOtp/)
  assert.match(routes[2], /verifyCustomerOtp/)
  assert.match(routes[3], /completeCustomerOtpSignup/)
  for (const source of routes) {
    assert.doesNotMatch(source, /BREVO_API_KEY/)
    assert.doesNotMatch(source, /codeHash/)
  }
})

test('Customer OTP storage never persists plaintext code and uses an opaque random identifier', () => {
  const service = read('src/lib/mobile/customerOtpAuth.ts')
  const schema = read('prisma/schema.prisma')
  const challengeModel = schema.match(/model CustomerAuthOtpChallenge \{[\s\S]*?\n\}/)?.[0]
  assert.match(service, /randomBytes\(32\)\.toString\('base64url'\)/)
  assert.match(service, /createHmac\('sha256'/)
  assert.match(service, /timingSafeEqual/)
  assert.ok(challengeModel)
  assert.match(challengeModel, /codeHash\s+String/)
  assert.doesNotMatch(challengeModel, /\n\s+code\s+String/)
})

test('Customer OTP verification is serialized, single-use and role isolated', () => {
  const service = read('src/lib/mobile/customerOtpAuth.ts')
  assert.match(service, /FOR UPDATE/)
  assert.match(service, /TransactionIsolationLevel\.Serializable/)
  assert.match(service, /challenge\.verifiedAt/)
  assert.match(service, /challenge\.consumedAt/)
  assert.match(service, /user\.role === 'user'/)
  assert.match(service, /!user\.driver/)
})

test('Customer OTP uses standard Customer sessions and preserves password/Google identity data', () => {
  const service = read('src/lib/mobile/customerOtpAuth.ts')
  assert.match(service, /issueMobileTokens/)
  assert.doesNotMatch(service, /hashedPassword:\s*null/)
  assert.doesNotMatch(service, /account\.delete|account\.update|account\.create/)
})

test('Brevo SMS remains backend-only and future channels are isolated behind delivery abstraction', () => {
  const delivery = read('src/lib/mobile/otpDelivery.ts')
  assert.match(delivery, /BREVO_API_KEY/)
  assert.match(delivery, /BREVO_SMS_SENDER/)
  assert.match(delivery, /api\.brevo\.com\/v3\/transactionalSMS\/send/)
  assert.match(delivery, /export type CustomerOtpChannel = 'email' \| 'sms'/)
  assert.doesNotMatch(delivery, /NEXT_PUBLIC_/)
})

test('OTP migration is additive and includes verification-state and challenge constraints', () => {
  const migration = read('prisma/migrations/20261005120000_customer_unified_otp_auth/migration.sql')
  assert.match(migration, /ADD COLUMN "phoneVerified"/)
  assert.match(migration, /CREATE TABLE "CustomerAuthOtpChallenge"/)
  assert.match(migration, /FOREIGN KEY \("userId"\)/)
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i)
})
