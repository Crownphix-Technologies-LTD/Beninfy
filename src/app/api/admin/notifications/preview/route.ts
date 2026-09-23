import { previewAdminNotification } from '@/lib/admin/notificationManagement'
import {
  notificationAdminGuard,
  notificationRequestBody,
  notificationAdminError,
} from '@/lib/admin/notificationHttp'
export const runtime = 'nodejs'
export async function POST(req: Request) {
  try {
    const guard = await notificationAdminGuard(req, true)
    if (guard.response) return guard.response
    return Response.json(
      await previewAdminNotification(guard.actorId, await notificationRequestBody(req))
    )
  } catch (error) {
    return notificationAdminError(error)
  }
}
