import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import {
  normalizePushAppType,
  normalizePushPlatform,
  registerPushDevice,
  revokePushDevice,
  validatePushToken,
} from '@/lib/mobile/notifications'

export const runtime = 'nodejs'

const registerSchema = z.object({
  token: z.string().trim(),
  platform: z.enum(['android', 'ios']),
  appType: z.enum(['customer', 'driver']),
  deviceId: z.string().trim().max(120).optional().nullable(),
  deviceName: z.string().trim().max(120).optional().nullable(),
  appVersion: z.string().trim().max(40).optional().nullable(),
  language: z.string().trim().max(16).optional().nullable(),
})

const deleteSchema = z.object({
  token: z.string().trim().optional().nullable(),
  appType: z.enum(['customer', 'driver']),
  deviceId: z.string().trim().max(120).optional().nullable(),
})

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-push-token-register',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many push token registration attempts', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid push token payload', parsed.error.flatten())
  if (!validatePushToken(parsed.data.token)) {
    return mobileError('PUSH_TOKEN_INVALID', 'Push token is invalid', 400)
  }

  const appType = normalizePushAppType(parsed.data.appType)
  const platform = normalizePushPlatform(parsed.data.platform)
  if (!appType || !platform) return mobileValidationError('Invalid push token payload')

  const result = await registerPushDevice({
    principal: guard.principal,
    input: {
      ...parsed.data,
      appType,
      platform,
    },
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    device: {
      id: result.device.id,
      appType: result.device.appType,
      platform: result.device.platform,
      deviceId: result.device.deviceId,
      language: result.device.language,
      lastSeenAt: result.device.lastSeenAt.toISOString(),
      revokedAt: result.device.revokedAt?.toISOString() ?? null,
      invalidatedAt: result.device.invalidatedAt?.toISOString() ?? null,
    },
  })
}

export async function DELETE(req: Request) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const body = await req.json().catch(() => null)
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid push token payload', parsed.error.flatten())

  const result = await revokePushDevice({
    principal: guard.principal,
    appType: parsed.data.appType,
    token: parsed.data.token,
    deviceId: parsed.data.deviceId,
  })
  if (!result.ok) {
    if (result.code === 'PUSH_TOKEN_NOT_FOUND') {
      return mobileError('PUSH_TOKEN_NOT_FOUND', 'Push token was not found', 404)
    }
    return mobileErrorFromCode(result.code)
  }

  return Response.json({ ok: true, revoked: result.revoked })
}
