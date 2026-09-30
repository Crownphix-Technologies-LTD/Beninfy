import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import {
  customerPushTokenSchema,
  registerPushDevice,
  revokePushDevice,
  pushLog,
} from '@/lib/mobile/pushDevices'
import { z } from 'zod'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) {
    pushLog('registration_failed', { category: 'authentication' })
    return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  }
  const limit = await checkRateLimit({
    scope: 'customer-push-register',
    identifier: guard.principal.userId + ':' + requestIp(req),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed) return mobileError('RATE_LIMITED', 'Too many registration attempts', 429)
  const parsed = customerPushTokenSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    pushLog('registration_failed', { userId: guard.principal.userId, category: 'validation' })
    return mobileValidationError('Invalid push token registration', parsed.error.flatten())
  }
  const result = await registerPushDevice({
    principal: guard.principal,
    input: {
      token: parsed.data.token,
      platform: parsed.data.platform,
      appType: 'customer',
      deviceId: parsed.data.installationId,
      deviceName: parsed.data.deviceName,
      appVersion: parsed.data.appVersion,
      language: parsed.data.locale,
    },
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({
    registration: {
      id: result.device.id,
      installationId: result.device.deviceId,
      platform: result.device.platform,
      locale: result.device.language,
      active: result.device.revokedAt === null && result.device.invalidatedAt === null,
      registeredAt: result.device.lastSeenAt.toISOString(),
    },
  })
}

const revokeSchema = z
  .object({
    installationId: z
      .string()
      .trim()
      .min(8)
      .max(120)
      .regex(/^[A-Za-z0-9._:-]+$/),
    token: z.string().trim().min(20).max(4096).optional().nullable(),
  })
  .strict()

export async function DELETE(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) {
    pushLog('revocation_failed', { category: 'authentication' })
    return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  }
  const parsed = revokeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return mobileValidationError('Invalid push token revocation', parsed.error.flatten())
  const result = await revokePushDevice({
    principal: guard.principal,
    appType: 'customer',
    deviceId: parsed.data.installationId,
    token: parsed.data.token,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({
    revocation: {
      installationId: parsed.data.installationId,
      revoked: result.revoked > 0,
      idempotent: result.revoked === 0,
    },
  })
}
