import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  customerGoogleAccountBlock,
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
})

test('Google linking contract is documented without client-supplied identity authority', () => {
  const docs = readFileSync('docs/mobile-api/authentication.md', 'utf8')
  assert.match(docs, /POST \/api\/mobile\/v1\/customer\/auth-methods\/google/)
  assert.match(docs, /409 GOOGLE_LINK_REQUIRED/)
  assert.match(docs, /without changing the Customer ID, password, bookings, Saved Travellers/)
  assert.doesNotMatch(docs, /"userId"\s*:/)
})
