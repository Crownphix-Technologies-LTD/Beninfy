import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { appTypeForPrincipal } from '@/lib/mobile/notifications'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { id } = await params
  const appType = appTypeForPrincipal(guard.principal)

  const notification = await prisma.notification.findFirst({
    where: { id, userId: guard.principal.userId, appType },
  })
  if (!notification) return mobileError('NOTIFICATION_NOT_FOUND', 'Notification not found', 404)

  const updated = notification.readAt
    ? notification
    : await prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      })

  return Response.json({
    notification: {
      id: updated.id,
      type: updated.type,
      readAt: updated.readAt?.toISOString() ?? null,
      unread: !updated.readAt,
    },
  })
}
