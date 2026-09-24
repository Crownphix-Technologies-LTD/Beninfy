import { checkRateLimit } from '@/lib/rateLimit'
import { requireAdminPermission } from '@/lib/admin'
import { authorizeNotificationActor, NotificationManagementError } from './notificationManagement'
import { writeAuditLog } from '@/lib/auditLog'

export function isSameOriginNotificationRequest(req: Request) {
  try {
    const origin = req.headers.get('origin')
    if (!origin) return false
    const parsed = new URL(origin)
    // Next may build req.url with an internal hostname behind its proxy. Host is
    // the browser-requested authority and cannot be overridden by browser JS.
    const host = req.headers.get('host') ?? new URL(req.url).host
    const protocol =
      req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ??
      new URL(req.url).protocol.slice(0, -1)
    return (
      parsed.origin === origin &&
      ['http:', 'https:'].includes(parsed.protocol) &&
      parsed.host === host &&
      parsed.protocol === protocol + ':'
    )
  } catch {
    return false
  }
}

// Apply the same guard to reads, selectors, preview, details and sends. Session alone is insufficient.
export async function notificationAdminGuard(req: Request, mutate = false) {
  const guard = await requireAdminPermission('users')
  if (!guard.ok) return { response: guard.response } as const
  await authorizeNotificationActor(guard.session.user?.id)
  if (mutate && !isSameOriginNotificationRequest(req))
    return {
      response: Response.json({ error: 'Same-origin request required' }, { status: 403 }),
    } as const
  if (mutate) {
    const rate = await checkRateLimit({
      scope: 'admin.notifications',
      identifier: guard.session.user!.id!,
      limit: 20,
      windowMs: 60000,
    })
    if (!rate.allowed)
      return {
        response: Response.json(
          { error: 'Too many notification requests. Please wait.' },
          { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } }
        ),
      } as const
  }
  return { actorId: guard.session.user!.id!, session: guard.session } as const
}
export async function notificationRequestBody(req: Request) {
  // Bound chunked requests as well as requests with Content-Length.
  const reader = req.body?.getReader()
  if (!reader) throw new NotificationManagementError(400, 'Request body required')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16384) {
        await reader.cancel()
        throw new NotificationManagementError(413, 'Request too large')
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch (error) {
    if (error instanceof NotificationManagementError) throw error
    throw new NotificationManagementError(400, 'Invalid JSON')
  } finally {
    reader.releaseLock()
  }
}
export function notificationAdminError(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof NotificationManagementError
          ? error.message
          : 'Notification request failed. Retry with the same confirmation to avoid duplicates.',
    },
    { status: error instanceof NotificationManagementError ? error.status : 500 }
  )
}
export { writeAuditLog }
