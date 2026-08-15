import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode } from '@/lib/mobile/errors'
import { logoutAllMobileSessions } from '@/lib/mobile/customerAccount'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  await logoutAllMobileSessions(guard.principal)

  return Response.json({ ok: true, sessionsRevoked: true })
}
