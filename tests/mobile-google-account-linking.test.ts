import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  customerGoogleAccountBlock,
  googleLinkChallengePolicy,
  googleLinkRelationship,
} from '@/lib/mobile/googleAuth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'

const activeCustomer = {
  role: 'user',
  disabledAt: null,
  deletionRequestedAt: null,
  anonymizedAt: null,
  driver: null,
}

test('Google account eligibility preserves Customer and privileged-role isolation', () => {
  assert.equal(customerGoogleAccountBlock(activeCustomer), null)
  assert.equal(customerGoogleAccountBlock({ ...activeCustomer, role: 'driver' }), 'GOOGLE_ACCOUNT_CONFLICT')
  assert.equal(
    customerGoogleAccountBlock({ ...activeCustomer, role: 'operations_admin' }),
    'GOOGLE_ACCOUNT_CONFLICT'
  )
  assert.equal(
    customerGoogleAccountBlock({ ...activeCustomer, driver: { id: 'driver-1' } }),
    'GOOGLE_ACCOUNT_CONFLICT'
  )
  assert.equal(
    customerGoogleAccountBlock({ ...activeCustomer, disabledAt: new Date() }),
    'ACCOUNT_DISABLED'
  )
})

test('Google sub relationship is idempotent only for the same Customer', () => {
  assert.equal(
    googleLinkRelationship({
      targetUserId: 'customer-a',
      identityOwnerUserId: 'customer-a',
      targetHasGoogleIdentity: true,
    }),
    'already_linked'
  )
  assert.equal(
    googleLinkRelationship({
      targetUserId: 'customer-a',
      identityOwnerUserId: 'customer-b',
      targetHasGoogleIdentity: false,
    }),
    'conflict'
  )
  assert.equal(
    googleLinkRelationship({
      targetUserId: 'customer-a',
      identityOwnerUserId: null,
      targetHasGoogleIdentity: true,
    }),
    'conflict'
  )
  assert.equal(
    googleLinkRelationship({
      targetUserId: 'customer-a',
      identityOwnerUserId: null,
      targetHasGoogleIdentity: false,
    }),
    'create'
  )
})

test('existing password Customer receives the frozen Google linking handoff', async () => {
  const response = mobileErrorFromCode('GOOGLE_LINK_REQUIRED')
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), {
    error: {
      code: 'GOOGLE_LINK_REQUIRED',
      message: 'Sign in to your existing customer account to link Google',
      details: {
        linking: {
          required: true,
          method: 'authenticated_customer',
          proof: 'current_password',
          endpoint: '/api/mobile/v1/customer/auth-methods/google',
        },
      },
    },
  })
})

test('server-issued Google linking challenge is short-lived and attempt bounded', () => {
  assert.deepEqual(googleLinkChallengePolicy(), { expiresIn: 300, maxAttempts: 5 })

  const loginRoute = readFileSync('src/app/api/mobile/v1/auth/google/route.ts', 'utf8')
  const linkRoute = readFileSync('src/app/api/mobile/v1/auth/google/link/route.ts', 'utf8')
  const service = readFileSync('src/lib/mobile/googleAuth.ts', 'utf8')
  assert.match(loginRoute, /challenge:\s*\{/)
  assert.match(loginRoute, /endpoint: '\/api\/mobile\/v1\/auth\/google\/link'/)
  assert.match(linkRoute, /completeGoogleLinkChallenge/)
  assert.doesNotMatch(linkRoute, /userId|providerAccountId|emailVerified/)
  assert.match(service, /randomBytes\(32\)\.toString\('base64url'\)/)
  assert.match(service, /createHash\('sha256'\)/)
  const challengeWrite = service.slice(
    service.indexOf('prisma.customerIdentityLinkChallenge.create'),
    service.indexOf('return { token, expiresAt')
  )
  assert.doesNotMatch(challengeWrite, /idToken|password|email/i)
})

test('Google linking limits issuance by IP and password proofs by Customer', () => {
  const loginRoute = readFileSync('src/app/api/mobile/v1/auth/google/route.ts', 'utf8')
  const linkRoute = readFileSync('src/app/api/mobile/v1/auth/google/link/route.ts', 'utf8')
  const service = readFileSync('src/lib/mobile/googleAuth.ts', 'utf8')

  assert.match(loginRoute, /scope: 'mobile-google-login'/)
  assert.match(loginRoute, /identifier: requestIp\(req\)/)
  assert.match(loginRoute, /limit: 20/)
  assert.match(linkRoute, /scope: 'mobile-google-link-challenge'/)
  assert.match(linkRoute, /limit: 10/)
  assert.match(service, /GOOGLE_LINK_ISSUANCE_WINDOW_MS = 15 \* 60 \* 1000/)
  assert.match(service, /GOOGLE_LINK_ISSUANCE_LIMIT = 5/)
  assert.match(service, /recentChallenges >= GOOGLE_LINK_ISSUANCE_LIMIT/)
  assert.match(service, /GOOGLE_LINK_PROOF_WINDOW_MS = 15 \* 60 \* 1000/)
  assert.match(service, /customerIdentityLinkChallenge\.aggregate/)
  assert.match(service, /customerFailedAttempts \+ 1 >= challenge\.maxAttempts/)
})

test('Google linking challenge migration is additive and stores no raw credentials', () => {
  const migration = readFileSync(
    'prisma/migrations/20261113160000_customer_google_link_challenges/migration.sql',
    'utf8'
  )
  assert.match(migration, /CREATE TABLE "CustomerIdentityLinkChallenge"/)
  assert.match(migration, /"tokenHash" TEXT NOT NULL/)
  assert.match(migration, /failedAttempts[\s\S]*maxAttempts/)
  assert.match(migration, /FOREIGN KEY \("userId"\) REFERENCES "User"/)
  assert.doesNotMatch(migration, /DROP |ALTER TABLE "(?:Booking|Payment|Coupon)"/)
  assert.doesNotMatch(migration, /idToken|currentPassword|emailAddress|accessToken/i)
})

test('Google linking implementation preserves password and Customer-owned records', () => {
  const source = readFileSync('src/lib/mobile/googleAuth.ts', 'utf8')
  const route = readFileSync(
    'src/app/api/mobile/v1/customer/auth-methods/google/route.ts',
    'utf8'
  )

  assert.match(source, /bcrypt\.compare\(input\.currentPassword, customer\.hashedPassword\)/)
  assert.match(source, /SELECT id FROM "User" WHERE id = \$\{customer\.id\} FOR UPDATE/)
  assert.match(source, /providerAccountId: verified\.profile\.sub/)
  assert.match(source, /provider: 'google'/)
  assert.match(source, /email: \{ equals: input\.email, mode: 'insensitive' \}/)
  assert.doesNotMatch(source, /hashedPassword:\s*(null|undefined)/)
  assert.doesNotMatch(source, /booking.*(delete|update)/i)
  assert.doesNotMatch(source, /savedTraveller.*(delete|update)/i)
  assert.match(route, /requireMobilePrincipal\(req, 'CUSTOMER'\)/)
  assert.match(route, /currentPassword/)
  assert.match(source, /completeGoogleLinkChallenge/)
  assert.match(source, /CustomerIdentityLinkChallenge/)
  assert.match(source, /data: \{ consumedAt: new Date\(\) \}/)
  assert.match(source, /issueTokens\([\s\S]*user: linked\.user/)
})

test('Google linking contract is documented without client-supplied identity authority', () => {
  const docs = readFileSync('docs/mobile-api/authentication.md', 'utf8')
  assert.match(docs, /POST \/api\/mobile\/v1\/customer\/auth-methods\/google/)
  assert.match(docs, /409 GOOGLE_LINK_REQUIRED/)
  assert.match(docs, /without changing the Customer ID, password, bookings, Saved Travellers/)
  assert.match(docs, /POST \/api\/mobile\/v1\/auth\/google\/link/)
  assert.match(docs, /single-use challenge/)
  assert.doesNotMatch(docs, /"userId"\s*:/)
})
