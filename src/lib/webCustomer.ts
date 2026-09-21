import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'

export async function requireWebCustomer(): Promise<
  { ok: true; principal: MobilePrincipal } | { ok: false; code: MobileErrorCode }
> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { ok: false, code: 'UNAUTHENTICATED' }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      disabledAt: true,
      anonymizedAt: true,
      deletionRequestedAt: true,
    },
  })
  if (!user) return { ok: false, code: 'UNAUTHENTICATED' }
  if (user.anonymizedAt || user.deletionRequestedAt)
    return { ok: false, code: 'ACCOUNT_DELETION_PENDING' }
  if (user.disabledAt) return { ok: false, code: 'ACCOUNT_DISABLED' }
  if (user.role !== 'user') return { ok: false, code: 'FORBIDDEN' }

  return {
    ok: true,
    principal: {
      type: 'CUSTOMER',
      userId: user.id,
      email: user.email ?? '',
      role: user.role,
      sessionId: `web:${user.id}`,
    },
  }
}
