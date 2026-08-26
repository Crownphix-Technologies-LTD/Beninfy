import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { MobilePrincipal, MobilePrincipalType } from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import { notifyMobileEmailOtp, notifyMobilePasswordReset } from '@/lib/notifications'

export type MobileOnboardingStatus = 'phone_required' | 'email_verification_required' | 'complete'

export type MobileOnboardingDto = {
  status: MobileOnboardingStatus
  nextStep: 'collect_phone' | 'verify_email_otp' | 'customer_home'
  phoneRequired: boolean
  emailVerified: boolean
}

export type MobileLocale = 'en' | 'fr'

const EMAIL_OTP_PURPOSE = 'customer_email_verification'
const PASSWORD_RESET_PURPOSE = 'customer_password_reset'
const OTP_TTL_MS = Number(process.env.MOBILE_EMAIL_OTP_TTL_MS ?? 10 * 60 * 1000)
const OTP_RESEND_COOLDOWN_MS = Number(process.env.MOBILE_EMAIL_OTP_RESEND_COOLDOWN_MS ?? 60 * 1000)
const OTP_MAX_ATTEMPTS = Number(process.env.MOBILE_EMAIL_OTP_MAX_ATTEMPTS ?? 5)
const RESET_TOKEN_TTL_MS = Number(process.env.MOBILE_PASSWORD_RESET_TTL_MS ?? 30 * 60 * 1000)

function onboardingSecret() {
  const secret =
    process.env.MOBILE_ONBOARDING_SECRET ||
    process.env.MOBILE_AUTH_SECRET ||
    process.env.AUTH_SECRET
  if (!secret)
    throw new Error('MOBILE_ONBOARDING_SECRET, MOBILE_AUTH_SECRET, or AUTH_SECRET is required')
  return secret
}

function hmac(value: string) {
  return createHmac('sha256', onboardingSecret()).update(value).digest('hex')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function normalizeMobileLocale(value: unknown): MobileLocale {
  return value === 'fr' ? 'fr' : 'en'
}

export function normalizeMobilePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '')
  const normalized = compact.startsWith('+')
    ? compact
    : compact.startsWith('00')
      ? `+${compact.slice(2)}`
      : compact
  const digits = normalized.startsWith('+') ? normalized.slice(1) : normalized

  if (/^229\d{8,10}$/.test(digits)) return `+${digits}`
  if (/^234\d{10}$/.test(digits)) return `+${digits}`
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`

  return null
}

export function toMobileOnboardingDto(user: {
  phone: string | null
  emailVerified: Date | string | null
}): MobileOnboardingDto {
  if (!user.phone) {
    return {
      status: 'phone_required',
      nextStep: 'collect_phone',
      phoneRequired: true,
      emailVerified: Boolean(user.emailVerified),
    }
  }

  if (!user.emailVerified) {
    return {
      status: 'email_verification_required',
      nextStep: 'verify_email_otp',
      phoneRequired: false,
      emailVerified: false,
    }
  }

  return {
    status: 'complete',
    nextStep: 'customer_home',
    phoneRequired: false,
    emailVerified: true,
  }
}

export function isMobileCustomerOnboardingComplete(user: {
  phone: string | null
  emailVerified: Date | string | null
}) {
  return toMobileOnboardingDto(user).status === 'complete'
}

export function hashOtpCode(input: {
  userId: string
  targetNormalized: string
  purpose?: string
  code: string
}) {
  return hmac(
    [
      input.purpose ?? EMAIL_OTP_PURPOSE,
      input.userId,
      input.targetNormalized.toLowerCase(),
      input.code,
    ].join(':')
  )
}

export function verifyOtpCode(input: {
  expectedHash: string
  userId: string
  targetNormalized: string
  purpose?: string
  code: string
}) {
  return safeEqual(
    input.expectedHash,
    hashOtpCode({
      userId: input.userId,
      targetNormalized: input.targetNormalized,
      purpose: input.purpose,
      code: input.code,
    })
  )
}

export function generateOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export async function requireCompletedCustomerOnboarding(user: {
  phone: string | null
  emailVerified: Date | string | null
}) {
  if (isMobileCustomerOnboardingComplete(user)) return { ok: true as const }
  return {
    ok: false as const,
    code: 'ONBOARDING_INCOMPLETE' as MobileErrorCode,
    onboarding: toMobileOnboardingDto(user),
  }
}

export async function updateCustomerPhoneAndSendEmailOtp(input: {
  principal: MobilePrincipal
  phone: string
  locale?: string
}) {
  const phone = normalizeMobilePhone(input.phone)
  if (!phone) return { ok: false as const, code: 'PHONE_INVALID' as MobileErrorCode }

  const user = await prisma.user.findUnique({ where: { id: input.principal.userId } })
  if (!user?.email) return { ok: false as const, code: 'UNAUTHENTICATED' as MobileErrorCode }

  const locale = normalizeMobileLocale(input.locale ?? user.locale)
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      phone,
      locale,
      emailVerified: null,
    },
  })

  const challenge = await createEmailOtpChallenge({
    userId: updated.id,
    email: updated.email ?? '',
    locale,
  })
  if (!challenge.ok) return challenge

  return {
    ok: true as const,
    verificationId: challenge.verificationId,
    expiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt,
    onboarding: toMobileOnboardingDto(updated),
  }
}

export async function createEmailOtpChallenge(input: {
  userId: string
  email: string
  locale?: string | null
}) {
  const now = new Date()
  const normalizedEmail = input.email.trim().toLowerCase()
  const existing = await prisma.otpChallenge.findFirst({
    where: {
      userId: input.userId,
      purpose: EMAIL_OTP_PURPOSE,
      targetNormalized: normalizedEmail,
      consumedAt: null,
      invalidatedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existing && existing.resendAvailableAt > now) {
    return {
      ok: false as const,
      code: 'OTP_RESEND_TOO_SOON' as MobileErrorCode,
      resendAvailableAt: existing.resendAvailableAt.toISOString(),
      expiresAt: existing.expiresAt.toISOString(),
    }
  }

  await prisma.otpChallenge.updateMany({
    where: {
      userId: input.userId,
      purpose: EMAIL_OTP_PURPOSE,
      consumedAt: null,
      invalidatedAt: null,
    },
    data: { invalidatedAt: now },
  })

  const code = generateOtpCode()
  const challenge = await prisma.otpChallenge.create({
    data: {
      userId: input.userId,
      purpose: EMAIL_OTP_PURPOSE,
      target: input.email,
      targetNormalized: normalizedEmail,
      codeHash: hashOtpCode({
        userId: input.userId,
        targetNormalized: normalizedEmail,
        code,
      }),
      maxAttempts: OTP_MAX_ATTEMPTS,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      resendAvailableAt: new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS),
    },
  })

  await notifyMobileEmailOtp({
    email: input.email,
    code,
    expiresAt: challenge.expiresAt,
    locale: normalizeMobileLocale(input.locale),
  })

  return {
    ok: true as const,
    verificationId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    resendAvailableAt: challenge.resendAvailableAt.toISOString(),
  }
}

export async function verifyCustomerEmailOtp(input: {
  principal: MobilePrincipal
  verificationId: string
  code: string
}) {
  const now = new Date()
  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      id: input.verificationId,
      userId: input.principal.userId,
      purpose: EMAIL_OTP_PURPOSE,
      consumedAt: null,
      invalidatedAt: null,
    },
  })
  if (!challenge) return { ok: false as const, code: 'OTP_INVALID' as MobileErrorCode }
  if (challenge.expiresAt <= now)
    return { ok: false as const, code: 'OTP_EXPIRED' as MobileErrorCode }
  if (challenge.attempts >= challenge.maxAttempts)
    return { ok: false as const, code: 'OTP_ATTEMPTS_EXCEEDED' as MobileErrorCode }

  const codeOk = verifyOtpCode({
    expectedHash: challenge.codeHash,
    userId: challenge.userId,
    targetNormalized: challenge.targetNormalized,
    code: input.code,
  })

  if (!codeOk) {
    const updated = await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    })
    return {
      ok: false as const,
      code:
        updated.attempts >= updated.maxAttempts
          ? ('OTP_ATTEMPTS_EXCEEDED' as MobileErrorCode)
          : ('OTP_INVALID' as MobileErrorCode),
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    await tx.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now },
    })
    await tx.otpChallenge.updateMany({
      where: {
        userId: challenge.userId,
        purpose: EMAIL_OTP_PURPOSE,
        id: { not: challenge.id },
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    })
    return tx.user.update({
      where: { id: challenge.userId },
      data: { emailVerified: now },
    })
  })

  return { ok: true as const, onboarding: toMobileOnboardingDto(user) }
}

export function hashPasswordResetToken(token: string) {
  return hmac([PASSWORD_RESET_PURPOSE, token].join(':'))
}

export function validateMobilePassword(password: string) {
  return password.length >= 8 && password.length <= 100
}

export type PasswordResetPrincipalType = Extract<MobilePrincipalType, 'CUSTOMER' | 'DRIVER'>

export function normalizePasswordResetPrincipalType(
  value: string | null | undefined
): PasswordResetPrincipalType {
  return value === 'DRIVER' ? 'DRIVER' : 'CUSTOMER'
}

export function passwordResetUserWhere(input: {
  email: string
  principalType?: PasswordResetPrincipalType | null
}) {
  const principalType = normalizePasswordResetPrincipalType(input.principalType)
  return {
    email: input.email.trim().toLowerCase(),
    role: principalType === 'DRIVER' ? 'driver' : 'user',
    disabledAt: null,
    hashedPassword: { not: null },
    ...(principalType === 'DRIVER' ? { driver: { isNot: null } } : {}),
  }
}

export async function requestMobilePasswordReset(input: {
  email: string
  principalType?: PasswordResetPrincipalType | null
  locale?: string | null
  origin: string
}) {
  const user = await prisma.user.findFirst({
    where: passwordResetUserWhere({
      email: input.email,
      principalType: input.principalType,
    }),
    select: { id: true, email: true, locale: true },
  })

  if (user?.email) {
    const now = new Date()
    const token = randomBytes(32).toString('base64url')
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    })
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashPasswordResetToken(token),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    })

    const webUrl = new URL('/en/reset-password', input.origin)
    webUrl.searchParams.set('token', token)
    const principalType = normalizePasswordResetPrincipalType(input.principalType)
    const appScheme = principalType === 'DRIVER' ? 'beninfy-driver' : 'beninfy'
    const appDeepLink = `${appScheme}://reset-password?token=${encodeURIComponent(token)}`
    await notifyMobilePasswordReset({
      email: user.email,
      webUrl: webUrl.toString(),
      appDeepLink,
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      locale: normalizeMobileLocale(user.locale ?? input.locale),
      principalType,
    })
  }

  return { ok: true as const }
}

export async function resetMobilePassword(input: { token: string; password: string }) {
  if (!validateMobilePassword(input.password)) {
    return { ok: false as const, code: 'PASSWORD_INVALID' as MobileErrorCode }
  }

  const tokenHash = hashPasswordResetToken(input.token)
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })
  const now = new Date()
  if (!record || record.consumedAt) {
    return { ok: false as const, code: 'RESET_TOKEN_INVALID' as MobileErrorCode }
  }
  if (record.expiresAt <= now) {
    return { ok: false as const, code: 'RESET_TOKEN_EXPIRED' as MobileErrorCode }
  }

  const hashedPassword = await bcrypt.hash(input.password, 12)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        hashedPassword,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { consumedAt: now },
    }),
    prisma.mobileSession.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ])

  return { ok: true as const }
}
