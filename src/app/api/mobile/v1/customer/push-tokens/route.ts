import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { customerPushTokenSchema, registerPushDevice, pushLog } from '@/lib/mobile/pushDevices'

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
      language: parsed.data.locale,
    },
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({
    installation: {
      id: result.device.id,
      installationId: result.device.deviceId,
      platform: result.device.platform,
      appType: 'customer',
      locale: result.device.language,
      active: true,
      lastSeenAt: result.device.lastSeenAt.toISOString(),
    },
  })
}
