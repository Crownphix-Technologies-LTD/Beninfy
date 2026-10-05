import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const url = process.env.OTP_AUTH_TEST_DATABASE_URL

test(
  'unified Customer OTP authentication is single-use, role-safe and race-safe in PostgreSQL',
  { skip: !url, timeout: 60000 },
  async () => {
    assert.equal(process.env.DATABASE_URL, url)
    const target = new URL(url!)
    assert.ok(['localhost', '127.0.0.1'].includes(target.hostname))
    assert.match(target.pathname, /^\/beninfy_otp_auth_test/)

    process.env.MOBILE_AUTH_SECRET = 'fixture-customer-otp-secret-that-is-not-for-production'
    const { prisma } = await import('../src/lib/prisma')
    const { completeCustomerOtpSignup, resendCustomerOtp, startCustomerOtp, verifyCustomerOtp } =
      await import('../src/lib/mobile/customerOtpAuth')

    const prefix = `otp-${randomUUID()}`
    const existingPassword = await bcrypt.hash('ExistingPassword123!', 12)
    const existing = await prisma.user.create({
      data: {
        name: 'Existing Customer',
        email: `${prefix}-existing@example.test`,
        phone: '+22951010405',
        hashedPassword: existingPassword,
        role: 'user',
      },
    })
    const admin = await prisma.user.create({
      data: {
        name: 'Privileged Account',
        email: `${prefix}-admin@example.test`,
        role: 'admin',
      },
    })
    await prisma.account.create({
      data: {
        userId: existing.id,
        type: 'oidc',
        provider: 'google',
        providerAccountId: `${prefix}-google-sub`,
      },
    })

    const delivered: Array<{ destination: string; code: string; channel: string }> = []
    const delivery = async (input: { destination: string; code: string; channel: string }) => {
      delivered.push(input)
    }
    function requireChallenge(result: Awaited<ReturnType<typeof startCustomerOtp>>) {
      if (!result.ok) assert.fail(`Expected challenge, received ${result.code}`)
      return result.challengeId
    }

    try {
      const started = await startCustomerOtp({
        email: existing.email!,
        channel: 'email',
        delivery,
      })
      assert.equal(started.ok, true)
      const startedId = requireChallenge(started)
      assert.equal(delivered.length, 1)
      assert.notEqual(
        (
          await prisma.customerAuthOtpChallenge.findUniqueOrThrow({
            where: { id: startedId },
          })
        ).codeHash,
        delivered[0].code
      )

      const wrong = await verifyCustomerOtp({ challengeId: startedId, code: '999999' })
      assert.equal(wrong.ok, false)

      const correctCode = delivered[0].code
      const attempts = await Promise.all([
        verifyCustomerOtp({ challengeId: startedId, code: correctCode }),
        verifyCustomerOtp({ challengeId: startedId, code: correctCode }),
      ])
      assert.equal(attempts.filter((result) => result.ok).length, 1)
      assert.equal(attempts.filter((result) => !result.ok).length, 1)

      const retained = await prisma.user.findUniqueOrThrow({
        where: { id: existing.id },
        include: { accounts: true },
      })
      assert.equal(retained.hashedPassword, existingPassword)
      assert.equal(retained.accounts.length, 1)

      const roleBlocked = await startCustomerOtp({
        email: admin.email!,
        channel: 'email',
        delivery,
      })
      assert.equal(roleBlocked.ok, true)
      const roleBlockedId = requireChallenge(roleBlocked)
      assert.equal(delivered.length, 1)
      const blockedVerify = await verifyCustomerOtp({
        challengeId: roleBlockedId,
        code: '000000',
      })
      assert.equal(blockedVerify.ok, false)

      const mismatchedSms = await startCustomerOtp({
        email: existing.email!,
        phone: '+22997000000',
        channel: 'sms',
        delivery,
      })
      assert.equal(mismatchedSms.ok, true)
      assert.equal(delivered.length, 1)

      const expiring = await startCustomerOtp({
        email: `${prefix}-expired@example.test`,
        channel: 'email',
        delivery,
      })
      const expiringId = requireChallenge(expiring)
      const expiredCode = delivered.at(-1)!.code
      await prisma.customerAuthOtpChallenge.update({
        where: { id: expiringId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      })
      const expired = await verifyCustomerOtp({
        challengeId: expiringId,
        code: expiredCode,
      })
      assert.equal(expired.ok, false)
      assert.equal(!expired.ok && expired.code, 'OTP_EXPIRED')

      const maxed = await startCustomerOtp({
        email: `${prefix}-maxed@example.test`,
        channel: 'email',
        delivery,
      })
      const maxedId = requireChallenge(maxed)
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await verifyCustomerOtp({ challengeId: maxedId, code: '111111' })
      }
      const maxedResult = await verifyCustomerOtp({
        challengeId: maxedId,
        code: delivered.at(-1)!.code,
      })
      assert.equal(maxedResult.ok, false)
      assert.equal(!maxedResult.ok && maxedResult.code, 'OTP_ATTEMPTS_EXCEEDED')

      const failedEmail = `${prefix}-delivery-failed@example.test`
      await assert.rejects(
        startCustomerOtp({
          email: failedEmail,
          channel: 'email',
          delivery: async () => {
            throw new Error('provider rejected fixture')
          },
        })
      )
      assert.equal(await prisma.user.findUnique({ where: { email: failedEmail } }), null)
      const failedChallenge = await prisma.customerAuthOtpChallenge.findFirstOrThrow({
        where: { identityEmail: failedEmail },
      })
      assert.ok(failedChallenge.deliveryFailedAt)
      assert.ok(failedChallenge.invalidatedAt)

      const signupEmail = `${prefix}-new@example.test`
      const signupStart = await startCustomerOtp({
        email: signupEmail,
        channel: 'email',
        delivery,
      })
      const signupStartId = requireChallenge(signupStart)
      const signupCode = delivered.at(-1)!.code
      const verified = await verifyCustomerOtp({
        challengeId: signupStartId,
        code: signupCode,
      })
      assert.equal(verified.ok && verified.outcome, 'signup_required')
      const signup = await completeCustomerOtpSignup({
        challengeId: signupStartId,
        name: 'OTP Customer',
        phone: '+2348012345678',
        termsAccepted: true,
        privacyAccepted: true,
        notifyRegistration: async () => undefined,
      })
      assert.equal(signup.ok && signup.outcome, 'authenticated')
      const created = await prisma.user.findUniqueOrThrow({ where: { email: signupEmail } })
      assert.ok(created.emailVerified)
      assert.equal(created.phoneVerified, null)
      assert.equal(created.hashedPassword, null)

      const smsEmail = `${prefix}-sms@example.test`
      const smsStart = await startCustomerOtp({
        email: smsEmail,
        phone: '+22890123456',
        channel: 'sms',
        delivery,
      })
      const smsStartId = requireChallenge(smsStart)
      const smsVerified = await verifyCustomerOtp({
        challengeId: smsStartId,
        code: delivered.at(-1)!.code,
      })
      assert.equal(smsVerified.ok && smsVerified.outcome, 'signup_required')
      const smsSignup = await completeCustomerOtpSignup({
        challengeId: smsStartId,
        name: 'SMS Customer',
        phone: '+22890123456',
        termsAccepted: true,
        privacyAccepted: true,
        notifyRegistration: async () => undefined,
      })
      assert.equal(smsSignup.ok && smsSignup.outcome, 'authenticated')
      const smsUser = await prisma.user.findUniqueOrThrow({ where: { email: smsEmail } })
      assert.equal(smsUser.emailVerified, null)
      assert.ok(smsUser.phoneVerified)

      const resendStart = await startCustomerOtp({
        email: `${prefix}-resend@example.test`,
        channel: 'email',
        delivery,
      })
      const resendStartId = requireChallenge(resendStart)
      await prisma.customerAuthOtpChallenge.update({
        where: { id: resendStartId },
        data: { resendAvailableAt: new Date(Date.now() - 1000) },
      })
      const resent = await resendCustomerOtp({ challengeId: resendStartId, delivery })
      assert.equal(resent.ok, true)
      assert.notEqual(resent.ok && resent.challengeId, resendStartId)
      assert.ok(
        (
          await prisma.customerAuthOtpChallenge.findUniqueOrThrow({
            where: { id: resendStartId },
          })
        ).invalidatedAt
      )
    } finally {
      await prisma.mobileSession.deleteMany({ where: { user: { email: { startsWith: prefix } } } })
      await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } })
      await prisma.$disconnect()
    }
  }
)
