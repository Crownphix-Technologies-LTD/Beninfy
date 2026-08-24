import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { toDriverProfileDto } from '@/lib/mobile/dtos'
import { changeDriverPassword } from '@/lib/mobile/driverSecurity'
import { mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

const schema = z.object({
  currentPassword: z.string().min(1).max(100),
  newPassword: z.string().min(8).max(100),
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
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid password change request', parsed.error.flatten())

  const result = await changeDriverPassword({
    principal: guard.principal,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
    device: parsed.data.device ?? {},
  })
  if (!result.ok) return mobileErrorFromCode(result.code)
  if (!result.driver) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  return Response.json({
    ok: true,
    session: {
      replaced: true,
      otherSessionsRevoked: true,
    },
    driver: toDriverProfileDto(result.driver),
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    tokenType: result.tokens.tokenType,
    expiresIn: result.tokens.expiresIn,
  })
}
