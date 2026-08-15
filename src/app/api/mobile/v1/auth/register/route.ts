import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { notifyUserRegistered } from '@/lib/notifications'
import { issueMobileTokens } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  phone: z.string().trim().min(4).max(30).optional(),
  device: z.object({
    deviceId: z.string().trim().max(120).optional(),
    platform: z.string().trim().max(40).optional(),
    deviceName: z.string().trim().max(120).optional(),
    appVersion: z.string().trim().max(40).optional(),
  }).optional(),
})

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit({
    scope: 'mobile-register',
    identifier: requestIp(req),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many registration attempts', 429, { retryAfter: rateLimit.retryAfter })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid input', parsed.error.flatten())

  const email = parsed.data.email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return mobileError('VALIDATION_ERROR', 'Email already registered', 409)

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12)
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      phone: parsed.data.phone,
      hashedPassword,
      role: 'user',
    },
  })
  await notifyUserRegistered(user.id)

  try {
    const tokens = await issueMobileTokens({
      user,
      principalType: 'CUSTOMER',
      device: parsed.data.device ?? {},
    })
    return Response.json({ user: toCustomerProfileDto(user), ...tokens }, { status: 201 })
  } catch {
    return mobileErrorFromCode('INTERNAL_ERROR')
  }
}
