import {
  adminNotificationDashboard,
  queueAdminNotification,
  rejectedNotificationAuditMetadata,
} from '@/lib/admin/notificationManagement'
import {
  notificationAdminGuard,
  notificationRequestBody,
  notificationAdminError,
  writeAuditLog,
} from '@/lib/admin/notificationHttp'
export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(req: Request) {
  try {
    const guard = await notificationAdminGuard(req)
    if (guard.response) return guard.response
    return Response.json(
      await adminNotificationDashboard(
        guard.actorId,
        new URL(req.url).searchParams.get('cursor')?.slice(0, 200)
      ),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return notificationAdminError(error)
  }
}
export async function POST(req: Request) {
  try {
    const guard = await notificationAdminGuard(req, true)
    if (guard.response) return guard.response
    const input = await notificationRequestBody(req)
    try {
      return Response.json(await queueAdminNotification(guard.actorId, input))
    } catch (error) {
      const metadata = await rejectedNotificationAuditMetadata(guard.actorId, input).catch(() => ({
        result: 'rejected',
        campaignId: null,
      }))
      await writeAuditLog({
        session: guard.session,
        req,
        action: 'notification.rejected',
        entityType: 'notification_campaign',
        entityId: metadata.campaignId,
        metadata,
      })
      throw error
    }
  } catch (error) {
    return notificationAdminError(error)
  }
}
