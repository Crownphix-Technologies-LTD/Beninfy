import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { notifyUserRegistered } from '@/lib/notifications'
import { issueMobileTokens } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'
import { normalizeMobileLocale, validateMobilePassword } from '@/lib/mobile/onboarding'

export const runtime = 'nodejs'

const schema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  termsAccepted: z.boolean(),
  privacyAccepted: z.boolean(),
  locale: z.enum(['en', 'fr']).optional(),
  device: z
    .object({
      deviceId: z.string().trim().max(120).optional(),
      platform: z.string().trim().max(40).optional(),
      deviceName: z.string().trim().max(120).optional(),
      appVersion: z.string().trim().max(40).optional(),
    })
    .optional(),
})

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit({
    scope: 'mobile-register',
    identifier: requestIp(req),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many registration attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid input', parsed.error.flatten())
  if (!parsed.data.termsAccepted || !parsed.data.privacyAccepted) {
    return mobileValidationError('Terms and privacy acceptance are required')
  }
  if (!validateMobilePassword(parsed.data.password)) {
    return mobileErrorFromCode('PASSWORD_INVALID')
  }

  const email = parsed.data.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return mobileError('VALIDATION_ERROR', 'Email already registered', 409)

  const name =
    parsed.data.name ??
    [parsed.data.firstName, parsed.data.lastName]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(' ')
      .trim()
  if (!name) return mobileValidationError('Name is required')

  const acceptedAt = new Date()
  const hashedPassword = await bcrypt.hash(parsed.data.password, 12)
  const user = await prisma.user.create({
    data: {
      name,
      email,
      hashedPassword,
      role: 'user',
      locale: normalizeMobileLocale(parsed.data.locale),
      termsAcceptedAt: acceptedAt,
      privacyAcceptedAt: acceptedAt,
      termsVersion: process.env.TERMS_VERSION ?? '2026-08-15',
      privacyVersion: process.env.PRIVACY_VERSION ?? '2026-08-15',
    },
  })
  await notifyUserRegistered(user.id)

  try {
    const tokens = await issueMobileTokens({
      user,
      principalType: 'CUSTOMER',
      device: parsed.data.device ?? {},
    })
    const profile = toCustomerProfileDto(user)
    return Response.json(
      { user: profile, onboarding: profile.onboarding, ...tokens },
      { status: 201 }
    )
  } catch {
    return mobileErrorFromCode('INTERNAL_ERROR')
  }
}
