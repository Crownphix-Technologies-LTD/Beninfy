import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { pushLog, revokePushDevice } from '@/lib/mobile/pushDevices'

export const runtime = 'nodejs'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ installationId: string }> }
) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) {
    pushLog('revocation_failed', { category: 'authentication', appType: 'driver' })
    return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  }
  const { installationId } = await params
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(installationId))
    return mobileValidationError('Invalid installation ID')
  const result = await revokePushDevice({
    principal: guard.principal,
    appType: 'driver',
    deviceId: installationId,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({
    revocation: {
      installationId,
      revoked: result.revoked > 0,
      idempotent: result.revoked === 0,
    },
  })
}
