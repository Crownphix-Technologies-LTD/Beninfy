import { z } from 'zod'
import { authenticateMobileLogin } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { toCustomerProfileDto, toDriverProfileDto } from '@/lib/mobile/dtos'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(100),
  principalType: z.enum(['CUSTOMER', 'DRIVER']).optional(),
  device: z.object({
    deviceId: z.string().trim().max(120).optional(),
    platform: z.string().trim().max(40).optional(),
    deviceName: z.string().trim().max(120).optional(),
    appVersion: z.string().trim().max(40).optional(),
  }).optional(),
})

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid input', parsed.error.flatten())

  const rateLimit = await checkRateLimit({
    scope: 'mobile-login',
    identifier: `${parsed.data.email.toLowerCase()}:${requestIp(req)}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many login attempts', 429, { retryAfter: rateLimit.retryAfter })
  }

  const result = await authenticateMobileLogin({
    email: parsed.data.email,
    password: parsed.data.password,
    principalType: parsed.data.principalType,
    device: parsed.data.device ?? {},
  })
  if (!result.ok) return mobileErrorFromCode(result.code ?? 'UNAUTHENTICATED')

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { driver: true },
  })
  if (!user) return mobileErrorFromCode('UNAUTHENTICATED')

  return Response.json({
    principalType: result.principalType,
    user: toCustomerProfileDto(user),
    driver: result.principalType === 'DRIVER' && user.driver ? toDriverProfileDto(user.driver) : null,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    tokenType: result.tokenType,
    expiresIn: result.expiresIn,
  })
}
