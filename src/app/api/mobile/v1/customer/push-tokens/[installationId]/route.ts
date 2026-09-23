import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { revokePushDevice, pushLog } from '@/lib/mobile/pushDevices'

export const runtime = 'nodejs'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ installationId: string }> }
) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) {
    pushLog('revocation_failed', { category: 'authentication' })
    return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  }
  const { installationId } = await params
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(installationId))
    return mobileValidationError('Invalid installation ID')
  const result = await revokePushDevice({
    principal: guard.principal,
    appType: 'customer',
    deviceId: installationId,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json({ ok: true })
}
