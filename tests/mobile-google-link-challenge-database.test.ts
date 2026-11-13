import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import bcrypt from 'bcryptjs'

const url = process.env.GOOGLE_LINK_TEST_DATABASE_URL

test(
  'Google identity-linking challenges are single-use, role-safe and race-safe in PostgreSQL',
  { skip: !url, timeout: 60000 },
  async () => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_google_link_test/)

    process.env.MOBILE_AUTH_SECRET = 'fixture-google-link-secret-that-is-not-for-production'
    process.env.GOOGLE_IOS_CLIENT_ID = 'fixture-ios-client.apps.googleusercontent.com'
    const { prisma } = await import('../src/lib/prisma')
    const {
      authenticateMobileGoogle,
      completeGoogleLinkChallenge,
      linkGoogleToCustomer,
    } = await import('../src/lib/mobile/googleAuth')
    const { POST: googleSignInPost } = await import('../src/app/api/mobile/v1/auth/google/route')

    const prefix = `google-link-${randomUUID()}`
    const password = 'ExistingPassword123!'
    const passwordHash = await bcrypt.hash(password, 10)
    let tokenProfile = {
      sub: `${prefix}-sub-a`,
      email: `${prefix}-Customer@Example.test`,
    }
    const originalFetch = global.fetch
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          iss: 'https://accounts.google.com',
          aud: process.env.GOOGLE_IOS_CLIENT_ID,
          exp: String(Math.floor(Date.now() / 1000) + 3600),
          sub: tokenProfile.sub,
          email: tokenProfile.email.toLowerCase(),
          email_verified: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )

    const customer = await prisma.user.create({
      data: {
        name: 'Existing Customer',
        email: tokenProfile.email,
        hashedPassword: passwordHash,
        role: 'user',
        savedTravellers: {
          create: { fullName: 'Preserved Traveller', phone: '+22951010000' },
        },
      },
    })

    async function issueChallenge() {
      const result = await authenticateMobileGoogle({
        idToken: 'fixture-google-id-token-that-is-never-stored',
        principalType: 'CUSTOMER',
        device: { deviceId: 'fixture-installation', platform: 'ios' },
      })
      assert.equal(result.ok, false)
      if (result.ok || result.code !== 'GOOGLE_LINK_REQUIRED' || !('linkingChallenge' in result)) {
        assert.fail('Expected GOOGLE_LINK_REQUIRED challenge')
      }
      return result.linkingChallenge.token
    }

    try {
      const handoff = await googleSignInPost(
        new Request('http://localhost/api/mobile/v1/auth/google', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            idToken: 'fixture-google-id-token-that-is-never-stored',
            principalType: 'CUSTOMER',
            device: { deviceId: 'fixture-installation', platform: 'ios' },
          }),
        })
      )
      assert.equal(handoff.status, 409)
      const handoffBody = await handoff.json()
      assert.equal(handoffBody.error.code, 'GOOGLE_LINK_REQUIRED')
      assert.equal(
        handoffBody.error.details.linking.endpoint,
        '/api/mobile/v1/customer/auth-methods/google'
      )
      assert.equal(
        handoffBody.error.details.linking.challenge.endpoint,
        '/api/mobile/v1/auth/google/link'
      )
      assert.equal(handoffBody.error.details.linking.challenge.expiresIn, 300)
      const firstToken = handoffBody.error.details.linking.challenge.token as string
      assert.ok(firstToken.length >= 32)
      const stored = await prisma.customerIdentityLinkChallenge.findFirstOrThrow({
        where: { userId: customer.id, consumedAt: null },
        orderBy: { createdAt: 'desc' },
      })
      assert.equal(stored.tokenHash, createHash('sha256').update(firstToken).digest('hex'))
      assert.notEqual(stored.tokenHash, firstToken)
      assert.equal(
        await prisma.mobileSession.count({ where: { userId: customer.id } }),
        0,
        'challenge issuance must not create a session'
      )

      const wrong = await completeGoogleLinkChallenge({
        challengeToken: firstToken,
        currentPassword: 'wrong-password',
        device: {},
      })
      assert.equal(!wrong.ok && wrong.code, 'GOOGLE_LINK_PROOF_INVALID')
      for (let attempt = 1; attempt < 4; attempt += 1) {
        const retry = await completeGoogleLinkChallenge({
          challengeToken: firstToken,
          currentPassword: 'wrong-password',
          device: {},
        })
        assert.equal(!retry.ok && retry.code, 'GOOGLE_LINK_PROOF_INVALID')
      }
      const finalWrongPassword = await completeGoogleLinkChallenge({
        challengeToken: firstToken,
        currentPassword: 'wrong-password',
        device: {},
      })
      assert.equal(
        !finalWrongPassword.ok && finalWrongPassword.code,
        'GOOGLE_LINK_ATTEMPTS_EXCEEDED'
      )
      const exhausted = await completeGoogleLinkChallenge({
        challengeToken: firstToken,
        currentPassword: password,
        device: {},
      })
      assert.equal(!exhausted.ok && exhausted.code, 'GOOGLE_LINK_CHALLENGE_INVALID')

      await prisma.customerIdentityLinkChallenge.updateMany({
        where: { userId: customer.id },
        data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
      })
      const rotatedTokens = await Promise.all([issueChallenge(), issueChallenge()])
      const firstConcurrentProofs = await Promise.all(
        rotatedTokens.map((challengeToken) =>
          completeGoogleLinkChallenge({
            challengeToken,
            currentPassword: 'wrong-password',
            device: {},
          })
        )
      )
      assert.equal(
        firstConcurrentProofs.every(
          (result) => !result.ok && result.code === 'GOOGLE_LINK_PROOF_INVALID'
        ),
        true
      )
      const secondConcurrentProofs = await Promise.all(
        rotatedTokens.map((challengeToken) =>
          completeGoogleLinkChallenge({
            challengeToken,
            currentPassword: 'wrong-password',
            device: {},
          })
        )
      )
      assert.equal(
        secondConcurrentProofs.every(
          (result) => !result.ok && result.code === 'GOOGLE_LINK_PROOF_INVALID'
        ),
        true
      )
      const exhaustedAcrossChallenges = await Promise.all(
        rotatedTokens.map((challengeToken) =>
          completeGoogleLinkChallenge({
            challengeToken,
            currentPassword: 'wrong-password',
            device: {},
          })
        )
      )
      assert.equal(
        exhaustedAcrossChallenges.every(
          (result) => !result.ok && result.code === 'GOOGLE_LINK_ATTEMPTS_EXCEEDED'
        ),
        true
      )
      const aggregateAttempts = await prisma.customerIdentityLinkChallenge.aggregate({
        where: {
          userId: customer.id,
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
        _sum: { failedAttempts: true },
      })
      assert.equal(aggregateAttempts._sum.failedAttempts, 5)
      await prisma.customerIdentityLinkChallenge.updateMany({
        where: { userId: customer.id },
        data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
      })

      const expiredToken = await issueChallenge()
      await prisma.customerIdentityLinkChallenge.update({
        where: { tokenHash: createHash('sha256').update(expiredToken).digest('hex') },
        data: { expiresAt: new Date(Date.now() - 1000) },
      })
      const expired = await completeGoogleLinkChallenge({
        challengeToken: expiredToken,
        currentPassword: password,
        device: {},
      })
      assert.equal(!expired.ok && expired.code, 'GOOGLE_LINK_CHALLENGE_EXPIRED')

      const successToken = await issueChallenge()
      const concurrent = await Promise.all([
        completeGoogleLinkChallenge({
          challengeToken: successToken,
          currentPassword: password,
          device: { deviceId: 'one', platform: 'ios' },
        }),
        completeGoogleLinkChallenge({
          challengeToken: successToken,
          currentPassword: password,
          device: { deviceId: 'two', platform: 'ios' },
        }),
      ])
      assert.equal(concurrent.filter((result) => result.ok).length, 1)
      assert.equal(concurrent.filter((result) => !result.ok).length, 1)

      const retained = await prisma.user.findUniqueOrThrow({
        where: { id: customer.id },
        include: { accounts: true, savedTravellers: true },
      })
      assert.equal(retained.id, customer.id)
      assert.equal(retained.hashedPassword, passwordHash)
      assert.equal(retained.savedTravellers.length, 1)
      assert.equal(retained.accounts.filter((account) => account.provider === 'google').length, 1)

      const replay = await completeGoogleLinkChallenge({
        challengeToken: successToken,
        currentPassword: password,
        device: {},
      })
      assert.equal(!replay.ok && replay.code, 'GOOGLE_LINK_CHALLENGE_INVALID')

      const recoveryCustomer = await prisma.user.create({
        data: {
          email: `${prefix}-recovery@example.test`,
          hashedPassword: passwordHash,
          role: 'user',
        },
      })
      tokenProfile = { sub: `${prefix}-recovery-sub`, email: recoveryCustomer.email! }
      const recoveryToken = await issueChallenge()
      await assert.rejects(
        completeGoogleLinkChallenge({
          challengeToken: recoveryToken,
          currentPassword: password,
          device: {},
          issueTokens: async () => {
            throw new Error('fixture session persistence failure')
          },
        }),
        /fixture session persistence failure/
      )
      assert.ok(
        await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: 'google',
              providerAccountId: tokenProfile.sub,
            },
          },
        })
      )
      const recovered = await authenticateMobileGoogle({
        idToken: 'fresh-google-token-after-session-failure',
        principalType: 'CUSTOMER',
        device: {},
      })
      assert.equal(recovered.ok, true)
      assert.equal(recovered.ok && recovered.user.id, recoveryCustomer.id)

      const conflictCustomer = await prisma.user.create({
        data: {
          email: `${prefix}-conflict@example.test`,
          hashedPassword: passwordHash,
          role: 'user',
        },
      })
      tokenProfile = { sub: `${prefix}-conflict-sub`, email: conflictCustomer.email! }
      const conflictToken = await issueChallenge()
      const otherCustomer = await prisma.user.create({
        data: { email: `${prefix}-other@example.test`, role: 'user' },
      })
      await prisma.account.create({
        data: {
          userId: otherCustomer.id,
          type: 'oauth',
          provider: 'google',
          providerAccountId: tokenProfile.sub,
        },
      })
      const conflict = await completeGoogleLinkChallenge({
        challengeToken: conflictToken,
        currentPassword: password,
        device: {},
      })
      assert.equal(!conflict.ok && conflict.code, 'GOOGLE_ACCOUNT_CONFLICT')

      for (const role of ['admin', 'driver']) {
        tokenProfile = {
          sub: `${prefix}-${role}-sub`,
          email: `${prefix}-${role}@example.test`,
        }
        await prisma.user.create({
          data: { email: tokenProfile.email, hashedPassword: passwordHash, role },
        })
        const blocked = await authenticateMobileGoogle({
          idToken: `fixture-${role}-token`,
          principalType: 'CUSTOMER',
          device: {},
        })
        assert.equal(!blocked.ok && blocked.code, 'GOOGLE_ACCOUNT_CONFLICT')
      }

      const disabledCustomer = await prisma.user.create({
        data: {
          email: `${prefix}-disabled@example.test`,
          hashedPassword: passwordHash,
          role: 'user',
        },
      })
      tokenProfile = { sub: `${prefix}-disabled-sub`, email: disabledCustomer.email! }
      const disabledToken = await issueChallenge()
      await prisma.user.update({ where: { id: disabledCustomer.id }, data: { disabledAt: new Date() } })
      const disabled = await completeGoogleLinkChallenge({
        challengeToken: disabledToken,
        currentPassword: password,
        device: {},
      })
      assert.equal(!disabled.ok && disabled.code, 'ACCOUNT_DISABLED')

      const deletingCustomer = await prisma.user.create({
        data: {
          email: `${prefix}-deleting@example.test`,
          hashedPassword: passwordHash,
          role: 'user',
        },
      })
      tokenProfile = { sub: `${prefix}-deleting-sub`, email: deletingCustomer.email! }
      const deletingToken = await issueChallenge()
      await prisma.user.update({
        where: { id: deletingCustomer.id },
        data: { deletionRequestedAt: new Date() },
      })
      const deleting = await completeGoogleLinkChallenge({
        challengeToken: deletingToken,
        currentPassword: password,
        device: {},
      })
      assert.equal(!deleting.ok && deleting.code, 'ACCOUNT_DELETION_PENDING')

      const issuanceCustomer = await prisma.user.create({
        data: {
          email: `${prefix}-issuance@example.test`,
          hashedPassword: passwordHash,
          role: 'user',
        },
      })
      tokenProfile = { sub: `${prefix}-issuance-sub`, email: issuanceCustomer.email! }
      for (let attempt = 0; attempt < 5; attempt += 1) await issueChallenge()
      const issuanceLimited = await authenticateMobileGoogle({
        idToken: 'sixth-google-link-attempt',
        principalType: 'CUSTOMER',
        device: {},
      })
      assert.equal(!issuanceLimited.ok && issuanceLimited.code, 'RATE_LIMITED')
      assert.equal(
        await prisma.customerIdentityLinkChallenge.count({
          where: { userId: issuanceCustomer.id },
        }),
        5
      )

      const legacyCustomer = await prisma.user.create({
        data: {
          email: `${prefix}-legacy@example.test`,
          hashedPassword: passwordHash,
          role: 'user',
        },
      })
      tokenProfile = { sub: `${prefix}-legacy-sub`, email: legacyCustomer.email! }
      const legacy = await linkGoogleToCustomer({
        principal: {
          type: 'CUSTOMER',
          userId: legacyCustomer.id,
          email: legacyCustomer.email!,
          role: 'user',
          sessionId: 'fixture-legacy-session',
        },
        idToken: 'legacy-google-id-token',
        currentPassword: password,
      })
      assert.equal(legacy.ok, true)
    } finally {
      global.fetch = originalFetch
      await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } })
      await prisma.$disconnect()
    }
  }
)
