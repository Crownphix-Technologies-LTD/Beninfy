import { z } from 'zod'
import { authenticateMobileGoogle } from '@/lib/mobile/googleAuth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const schema = z.object({
  idToken: z.string().trim().min(20).max(12000),
  principalType: z.literal('CUSTOMER').default('CUSTOMER'),
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
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid Google sign-in payload', parsed.error.flatten())

  const rateLimit = await checkRateLimit({
    scope: 'mobile-google-login',
    identifier: requestIp(req),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many Google sign-in attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const result = await authenticateMobileGoogle({
    idToken: parsed.data.idToken,
    principalType: parsed.data.principalType,
    device: parsed.data.device ?? {},
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  const profile = toCustomerProfileDto(result.user)
  return Response.json({
    principalType: result.principalType,
    user: profile,
    onboarding: profile.onboarding,
    driver: null,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    tokenType: result.tokenType,
    expiresIn: result.expiresIn,
  })
}
