import { searchNotificationRecipients } from '@/lib/admin/notificationManagement'
import { notificationAudienceSchema } from '@/lib/admin/notificationContract'
import { notificationAdminGuard, notificationAdminError } from '@/lib/admin/notificationHttp'
export async function GET(req: Request) {
  try {
    const guard = await notificationAdminGuard(req)
    if (guard.response) return guard.response
    const query = new URL(req.url).searchParams
    const audience = notificationAudienceSchema.safeParse(query.get('audience'))
    if (!audience.success) return Response.json({ error: 'Invalid audience' }, { status: 400 })
    return Response.json(
      {
        recipients: await searchNotificationRecipients(
          guard.actorId,
          audience.data,
          query.get('q') ?? ''
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    return notificationAdminError(error)
  }
}
