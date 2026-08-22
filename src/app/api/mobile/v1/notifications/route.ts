import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { appTypeForPrincipal } from '@/lib/mobile/notifications'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function toNotificationDto(notification: {
  id: string
  type: string
  title: string
  body: string
  payload: unknown
  language: string
  deliveryState: string
  readAt: Date | null
  createdAt: Date
}) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    payload: notification.payload,
    language: notification.language,
    deliveryState: notification.deliveryState,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    unread: !notification.readAt,
  }
}

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const url = new URL(req.url)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT))
  )
  const cursor = url.searchParams.get('cursor') || undefined
  const unreadOnly = url.searchParams.get('unread') === 'true'
  const appType = appTypeForPrincipal(guard.principal)

  const baseWhere = {
    userId: guard.principal.userId,
    appType,
  }
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        ...baseWhere,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.notification.count({
      where: {
        ...baseWhere,
        readAt: null,
      },
    }),
  ])
  const hasMore = notifications.length > limit
  const page = hasMore ? notifications.slice(0, limit) : notifications

  return Response.json({
    unreadCount,
    notifications: page.map(toNotificationDto),
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    },
  })
}
