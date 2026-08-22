import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { toDriverProfileDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const driver = await prisma.driver.findUnique({
    where: { id: guard.principal.driverId },
    include: { presence: true, user: { select: { image: true } } },
  })
  if (!driver) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  return Response.json({ driver: toDriverProfileDto(driver) })
}
