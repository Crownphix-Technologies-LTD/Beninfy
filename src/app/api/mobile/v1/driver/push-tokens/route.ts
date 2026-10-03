import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { driverPushTokenSchema, pushLog, registerPushDevice } from '@/lib/mobile/pushDevices'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) {
    pushLog('registration_failed', { category: 'authentication', appType: 'driver' })
    return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  }
  const limit = await checkRateLimit({
    scope: 'driver-push-register',
    identifier: guard.principal.userId + ':' + requestIp(req),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed) return mobileError('RATE_LIMITED', 'Too many registration attempts', 429)
  const parsed = driverPushTokenSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    pushLog('registration_failed', {
      userId: guard.principal.userId,
      appType: 'driver',
      category: 'validation',
    })
    return mobileValidationError('Invalid push token registration', parsed.error.flatten())
  }
  const result = await registerPushDevice({
    principal: guard.principal,
    input: {
      token: parsed.data.token,
      platform: parsed.data.platform,
      appType: 'driver',
      deviceId: parsed.data.installationId,
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
