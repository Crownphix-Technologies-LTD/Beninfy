import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { Prisma, type User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { issueMobileTokens, type MobileDeviceInput } from '@/lib/mobile/auth'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'
import { notifyUserRegistered } from '@/lib/notifications'
import { normalizeMobileLocale, normalizeMobilePhone } from '@/lib/mobile/onboarding'
import {
  deliverCustomerOtp,
  type CustomerOtpChannel,
  type OtpDeliveryError,
} from '@/lib/mobile/otpDelivery'

export type CustomerOtpPurpose = 'customer_auth'
export type CustomerOtpOutcome = 'authenticated' | 'signup_required'

const PURPOSE: CustomerOtpPurpose = 'customer_auth'
const TTL_MS = 5 * 60 * 1000
const RESEND_MS = 60 * 1000
const MAX_ATTEMPTS = 5

type Delivery = typeof deliverCustomerOtp

async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      const retryable =
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') ||
        String(error).includes('could not serialize access')
      if (!retryable || attempt === 2) throw error
    }
  }
  throw new Error('Serializable transaction retry exhausted')
}

function secret() {
  const value =
    process.env.MOBILE_OTP_SECRET || process.env.MOBILE_AUTH_SECRET || process.env.AUTH_SECRET
  if (!value) throw new Error('MOBILE_OTP_SECRET, MOBILE_AUTH_SECRET, or AUTH_SECRET is required')
  return value
}

function hashCode(input: {
  challengeId: string
  channel: CustomerOtpChannel
  target: string
  code: string
}) {
  return createHmac('sha256', secret())
    .update([PURPOSE, input.challengeId, input.channel, input.target, input.code].join(':'))
    .digest('hex')
}

function equalHash(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function normalizeCustomerAuthEmail(value: string) {
  return value.trim().toLowerCase()
}

export function maskCustomerOtpDestination(channel: CustomerOtpChannel, value: string) {
  if (channel === 'sms') {
    const suffix = value.slice(-4)
    return `${value.slice(0, Math.min(4, Math.max(1, value.length - 4)))} •••• ${suffix}`
  }
  const [local, domain] = value.split('@')
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'•'.repeat(Math.max(3, Math.min(6, local.length - visible.length)))}@${domain}`
}

export function customerOtpPolicy() {
  return {
    codeLength: 6,
    expiresIn: Math.floor(TTL_MS / 1000),
    resendAfter: Math.floor(RESEND_MS / 1000),
    maxAttempts: MAX_ATTEMPTS,
  }
}

function code() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

function challengeId() {
  return randomBytes(32).toString('base64url')
}

function eligibleCustomer(user: (User & { driver?: unknown }) | null) {
  return Boolean(
    user &&
    user.role === 'user' &&
    !user.driver &&
    !user.disabledAt &&
    !user.anonymizedAt &&
    !user.deletionRequestedAt
  )
}

function publicChallenge(challenge: {
  id: string
  channel: string
  targetMasked: string
  expiresAt: Date
  resendAvailableAt: Date
}) {
  return {
    challengeId: challenge.id,
    channel: challenge.channel as CustomerOtpChannel,
    destination: challenge.targetMasked,
    expiresAt: challenge.expiresAt.toISOString(),
    expiresIn: customerOtpPolicy().expiresIn,
    resendAvailableAt: challenge.resendAvailableAt.toISOString(),
    resendAfter: customerOtpPolicy().resendAfter,
  }
}

export async function recordCustomerOtpAudit(
  action: string,
  challengeIdValue: string | null,
  metadata?: Prisma.InputJsonValue
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType: 'CustomerAuthOtpChallenge',
        entityId: challengeIdValue,
        metadata,
      },
    })
  } catch {
    console.error('Customer OTP audit event could not be persisted', { action })
  }
}

async function persistAndDeliver(input: {
  email: string
  channel: CustomerOtpChannel
  target: string
  masked: string
  userId: string | null
  eligible: boolean
  locale: 'en' | 'fr'
  delivery: Delivery
}) {
  const now = new Date()
  const id = challengeId()
  const otp = code()
  const challenge = await serializableTransaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${PURPOSE}:${input.email}`}))::text`
    await tx.customerAuthOtpChallenge.updateMany({
      where: {
        identityEmail: input.email,
        purpose: PURPOSE,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    })
    return tx.customerAuthOtpChallenge.create({
      data: {
        id,
        userId: input.userId,
        purpose: PURPOSE,
        channel: input.channel,
        identityEmail: input.email,
        targetNormalized: input.target,
        targetMasked: input.masked,
        codeHash: hashCode({
          challengeId: id,
          channel: input.channel,
          target: input.target,
          code: otp,
        }),
        locale: input.locale,
        eligible: input.eligible,
        maxAttempts: MAX_ATTEMPTS,
        expiresAt: new Date(now.getTime() + TTL_MS),
        resendAvailableAt: new Date(now.getTime() + RESEND_MS),
      },
    })
  })

  await recordCustomerOtpAudit('customer_otp_requested', challenge.id, {
    channel: input.channel,
  })
  if (!input.eligible) return publicChallenge(challenge)

  try {
    await input.delivery({
      channel: input.channel,
      destination: input.target,
      code: otp,
      expiresInMinutes: TTL_MS / 60_000,
      locale: input.locale,
    })
    await prisma.customerAuthOtpChallenge.update({
      where: { id: challenge.id },
      data: { deliveredAt: new Date() },
    })
    return publicChallenge(challenge)
  } catch (error) {
    await prisma.customerAuthOtpChallenge.update({
      where: { id: challenge.id },
      data: { deliveryFailedAt: new Date(), invalidatedAt: new Date() },
    })
    await recordCustomerOtpAudit('customer_otp_delivery_failed', challenge.id, {
      channel: input.channel,
    })
    throw error as OtpDeliveryError
  }
}

export async function startCustomerOtp(input: {
  email: string
  channel: CustomerOtpChannel
  phone?: string | null
  locale?: string | null
  delivery?: Delivery
}) {
  const email = normalizeCustomerAuthEmail(input.email)
  const locale = normalizeMobileLocale(input.locale)
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { driver: true },
  })
  const customerEligible = user ? eligibleCustomer(user) : true
  let target = email
  let eligible = customerEligible

  if (input.channel === 'sms') {
    const phone = input.phone ? normalizeMobilePhone(input.phone) : null
    if (!phone) return { ok: false as const, code: 'PHONE_INVALID' as const }
    target = phone
    if (user && (!user.phone || normalizeMobilePhone(user.phone) !== phone)) eligible = false
  }

  const challenge = await persistAndDeliver({
    email,
    channel: input.channel,
    target,
    masked: maskCustomerOtpDestination(input.channel, target),
    userId: eligible && user ? user.id : null,
    eligible,
    locale,
    delivery: input.delivery ?? deliverCustomerOtp,
  })
  return { ok: true as const, ...challenge }
}

export async function resendCustomerOtp(input: { challengeId: string; delivery?: Delivery }) {
  const current = await prisma.customerAuthOtpChallenge.findUnique({
    where: { id: input.challengeId },
  })
  const now = new Date()
  if (
    !current ||
    current.verifiedAt ||
    current.consumedAt ||
    current.invalidatedAt ||
    current.expiresAt <= now
  ) {
    return { ok: false as const, code: 'OTP_INVALID' as const }
  }
  if (current.resendAvailableAt > now) {
    return {
      ok: false as const,
      code: 'OTP_RESEND_TOO_SOON' as const,
      retryAfter: Math.ceil((current.resendAvailableAt.getTime() - now.getTime()) / 1000),
    }
  }

  const challenge = await persistAndDeliver({
    email: current.identityEmail,
    channel: current.channel as CustomerOtpChannel,
    target: current.targetNormalized,
    masked: current.targetMasked,
    userId: current.userId,
    eligible: current.eligible,
    locale: normalizeMobileLocale(current.locale),
    delivery: input.delivery ?? deliverCustomerOtp,
  })
  return { ok: true as const, ...challenge }
}

async function customerSession(user: User, device: MobileDeviceInput) {
  const tokens = await issueMobileTokens({ user, principalType: 'CUSTOMER', device })
  const profile = toCustomerProfileDto(user)
  return {
    outcome: 'authenticated' as const,
    principalType: 'CUSTOMER' as const,
    user: profile,
    onboarding: profile.onboarding,
    ...tokens,
  }
}

export async function verifyCustomerOtp(input: {
  challengeId: string
  code: string
  device?: MobileDeviceInput
}) {
  const now = new Date()
  const result = await serializableTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CustomerAuthOtpChallenge" WHERE id = ${input.challengeId} FOR UPDATE`
    const challenge = await tx.customerAuthOtpChallenge.findUnique({
      where: { id: input.challengeId },
    })
    if (
      !challenge ||
      challenge.verifiedAt ||
      challenge.consumedAt ||
      challenge.invalidatedAt ||
      !challenge.eligible
    ) {
      return { ok: false as const, code: 'OTP_INVALID' as const }
    }
    if (challenge.expiresAt <= now) return { ok: false as const, code: 'OTP_EXPIRED' as const }
    if (challenge.attempts >= challenge.maxAttempts) {
      return { ok: false as const, code: 'OTP_ATTEMPTS_EXCEEDED' as const }
    }
    const valid = equalHash(
      challenge.codeHash,
      hashCode({
        challengeId: challenge.id,
        channel: challenge.channel as CustomerOtpChannel,
        target: challenge.targetNormalized,
        code: input.code,
      })
    )
    if (!valid) {
      const updated = await tx.customerAuthOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      })
      return {
        ok: false as const,
        code:
          updated.attempts >= updated.maxAttempts
            ? ('OTP_ATTEMPTS_EXCEEDED' as const)
            : ('OTP_INVALID' as const),
      }
    }

    if (!challenge.userId) {
      await tx.customerAuthOtpChallenge.update({
        where: { id: challenge.id },
        data: { verifiedAt: now },
      })
      return {
        ok: true as const,
        outcome: 'signup_required' as const,
        challengeId: challenge.id,
        channel: challenge.channel as CustomerOtpChannel,
        email: challenge.identityEmail,
      }
    }

    const user = await tx.user.findUnique({
      where: { id: challenge.userId },
      include: { driver: true },
    })
    if (!user || !eligibleCustomer(user))
      return { ok: false as const, code: 'OTP_INVALID' as const }
    const verification =
      challenge.channel === 'email' ? { emailVerified: now } : { phoneVerified: now }
    const updated = await tx.user.update({ where: { id: user.id }, data: verification })
    await tx.customerAuthOtpChallenge.update({
      where: { id: challenge.id },
      data: { verifiedAt: now, consumedAt: now },
    })
    await tx.customerAuthOtpChallenge.updateMany({
      where: {
        identityEmail: challenge.identityEmail,
        id: { not: challenge.id },
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    })
    return { ok: true as const, outcome: 'authenticated' as const, user: updated }
  })

  if (!result.ok) {
    await recordCustomerOtpAudit('customer_otp_verification_failed', input.challengeId, {
      code: result.code,
    })
    return result
  }
  await recordCustomerOtpAudit('customer_otp_verified', input.challengeId, {
    outcome: result.outcome,
  })
  if (result.outcome === 'signup_required') {
    return {
      ok: true as const,
      outcome: result.outcome,
      challengeId: result.challengeId,
      channel: result.channel,
      signup: { required: true as const },
    }
  }
  return { ok: true as const, ...(await customerSession(result.user, input.device ?? {})) }
}

export async function completeCustomerOtpSignup(input: {
  challengeId: string
  name: string
  phone: string
  termsAccepted: boolean
  privacyAccepted: boolean
  locale?: string | null
  device?: MobileDeviceInput
  notifyRegistration?: (userId: string) => Promise<unknown>
}) {
  if (!input.termsAccepted || !input.privacyAccepted || input.name.trim().length < 2) {
    return { ok: false as const, code: 'VALIDATION_ERROR' as const }
  }
  const phone = normalizeMobilePhone(input.phone)
  if (!phone) return { ok: false as const, code: 'PHONE_INVALID' as const }
  const now = new Date()
  try {
    const user = await serializableTransaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CustomerAuthOtpChallenge" WHERE id = ${input.challengeId} FOR UPDATE`
      const challenge = await tx.customerAuthOtpChallenge.findUnique({
        where: { id: input.challengeId },
      })
      if (
        !challenge ||
        !challenge.eligible ||
        !challenge.verifiedAt ||
        challenge.consumedAt ||
        challenge.invalidatedAt ||
        challenge.expiresAt <= now ||
        challenge.userId
      ) {
        throw new Error('OTP_SIGNUP_PROOF_INVALID')
      }
      if (challenge.channel === 'sms' && challenge.targetNormalized !== phone) {
        throw new Error('OTP_SIGNUP_PHONE_MISMATCH')
      }
      const existing = await tx.user.findFirst({
        where: { email: { equals: challenge.identityEmail, mode: 'insensitive' } },
      })
      if (existing) throw new Error('OTP_IDENTITY_CONFLICT')

      const created = await tx.user.create({
        data: {
          name: input.name.trim(),
          email: challenge.identityEmail,
          phone,
          role: 'user',
          locale: normalizeMobileLocale(input.locale ?? challenge.locale),
          emailVerified: challenge.channel === 'email' ? challenge.verifiedAt : null,
          phoneVerified: challenge.channel === 'sms' ? challenge.verifiedAt : null,
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          termsVersion: process.env.TERMS_VERSION ?? '2026-08-15',
          privacyVersion: process.env.PRIVACY_VERSION ?? '2026-08-15',
        },
      })
      await tx.customerAuthOtpChallenge.update({
        where: { id: challenge.id },
        data: { userId: created.id, consumedAt: now },
      })
      return created
    })
    await recordCustomerOtpAudit('customer_otp_signup_completed', input.challengeId)
    await (input.notifyRegistration ?? notifyUserRegistered)(user.id)
    return { ok: true as const, ...(await customerSession(user, input.device ?? {})) }
  } catch (error) {
    if (error instanceof Error && error.message === 'OTP_SIGNUP_PHONE_MISMATCH') {
      return { ok: false as const, code: 'PHONE_INVALID' as const }
    }
    if (error instanceof Error && error.message === 'OTP_IDENTITY_CONFLICT') {
      return { ok: false as const, code: 'OTP_IDENTITY_CONFLICT' as const }
    }
    if (error instanceof Error && error.message === 'OTP_SIGNUP_PROOF_INVALID') {
      return { ok: false as const, code: 'OTP_INVALID' as const }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false as const, code: 'OTP_IDENTITY_CONFLICT' as const }
    }
    throw error
  }
}
