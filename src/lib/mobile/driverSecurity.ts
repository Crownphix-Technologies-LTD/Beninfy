import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import {
  issueMobileTokens,
  type MobileDeviceInput,
  type MobilePrincipal,
} from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import { validateMobilePassword } from '@/lib/mobile/onboarding'

export async function changeDriverPassword({
  principal,
  currentPassword,
  newPassword,
  device,
}: {
  principal: MobilePrincipal
  currentPassword: string
  newPassword: string
  device: MobileDeviceInput
}) {
  if (!principal.driverId) {
    return { ok: false as const, code: 'DRIVER_NOT_LINKED' as MobileErrorCode }
  }
  if (!validateMobilePassword(newPassword)) {
    return { ok: false as const, code: 'PASSWORD_INVALID' as MobileErrorCode }
  }

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    include: { driver: { include: { presence: true, user: { select: { image: true } } } } },
  })
  if (!user?.hashedPassword) {
    return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as MobileErrorCode }
  }
  if (!user.driver) {
    return { ok: false as const, code: 'DRIVER_NOT_LINKED' as MobileErrorCode }
  }
  if (user.driver.status === 'inactive') {
    return { ok: false as const, code: 'DRIVER_INACTIVE' as MobileErrorCode }
  }

  const currentOk = await bcrypt.compare(currentPassword, user.hashedPassword)
  if (!currentOk) {
    return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as MobileErrorCode }
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12)
  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        sessionVersion: { increment: 1 },
      },
    })
    await tx.mobileSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return updated
  })

  const [driver, tokens] = await Promise.all([
    prisma.driver.findUnique({
      where: { id: user.driver.id },
      include: { presence: true, user: { select: { image: true } } },
    }),
    issueMobileTokens({
      user: updatedUser,
      principalType: 'DRIVER',
      driverId: user.driver.id,
      device,
    }),
  ])

  return { ok: true as const, driver, tokens }
}
