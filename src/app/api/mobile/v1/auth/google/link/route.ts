import { z } from 'zod'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { completeGoogleLinkChallenge } from '@/lib/mobile/googleAuth'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const schema = z.object({
  challengeToken: z.string().trim().min(32).max(256),
  currentPassword: z.string().min(1).max(100),
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
    scope: 'mobile-google-link-challenge',
    identifier: requestIp(req),
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many Google linking attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return mobileValidationError('Invalid Google linking payload', parsed.error.flatten())
  }

  const result = await completeGoogleLinkChallenge({
    challengeToken: parsed.data.challengeToken,
    currentPassword: parsed.data.currentPassword,
    device: parsed.data.device ?? {},
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  const profile = toCustomerProfileDto(result.user)
  return Response.json({
    linked: true,
    alreadyLinked: result.alreadyLinked,
    provider: 'google',
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
