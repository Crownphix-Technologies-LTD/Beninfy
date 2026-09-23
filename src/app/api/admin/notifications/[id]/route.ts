import { adminNotificationDetail } from '@/lib/admin/notificationManagement'
import { notificationAdminGuard, notificationAdminError } from '@/lib/admin/notificationHttp'
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const guard = await notificationAdminGuard(req)
    if (guard.response) return guard.response
    return Response.json(await adminNotificationDetail(guard.actorId, (await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return notificationAdminError(error)
  }
}
