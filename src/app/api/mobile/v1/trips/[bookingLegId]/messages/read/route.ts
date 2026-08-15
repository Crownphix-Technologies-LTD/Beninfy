import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { markChatRead } from '@/lib/mobile/chat'
import { mobileErrorFromCode } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingLegId: string }> }
) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { bookingLegId } = await params

  const result = await markChatRead({
    principal: guard.principal,
    bookingLegId,
  })
  if (!result.ok) return mobileErrorFromCode(result.code, result.message)

  return Response.json({
    ok: true,
    readAt: result.readAt.toISOString(),
    conversationsUpdated: result.conversationsUpdated,
  })
}
