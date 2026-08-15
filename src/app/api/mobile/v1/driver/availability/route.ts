import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { toDriverProfileDto } from '@/lib/mobile/dtos'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { isDriverDutyStatus, updateDriverDutyStatus } from '@/lib/mobile/driverOperations'

export const runtime = 'nodejs'

const schema = z.object({
  status: z.enum(['available', 'off_duty']),
})

export async function PATCH(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid driver availability payload', parsed.error.flatten())
  if (!isDriverDutyStatus(parsed.data.status)) return mobileErrorFromCode('INVALID_DRIVER_STATUS')

  const result = await updateDriverDutyStatus({
    req,
    principal: guard.principal,
    status: parsed.data.status,
  })
  if (!result.ok) {
    return result.code === 'ACTIVE_TRIP_PREVENTS_OFF_DUTY'
      ? mobileError(result.code, 'An active trip prevents going off duty', 409, result.details)
      : mobileErrorFromCode(result.code)
  }
  if (!result.driver) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  return Response.json({ driver: toDriverProfileDto(result.driver) })
}
