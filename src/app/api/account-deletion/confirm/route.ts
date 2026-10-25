import { confirmWebAccountDeletion } from '@/lib/webAccountDeletion'
import {
  deletionConfirmSchema,
  deletionIpLimit,
  deletionJson,
  deletionRequestAllowed,
  readDeletionBody,
} from '@/lib/webAccountDeletionHttp'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (!deletionRequestAllowed(req)) return deletionJson({ code: 'REQUEST_REJECTED' }, 403)
  try {
    if (!(await deletionIpLimit(req, 'confirm')).allowed)
      return deletionJson({ code: 'RATE_LIMITED' }, 429)
    const parsed = deletionConfirmSchema.safeParse(await readDeletionBody(req))
    if (!parsed.success) return deletionJson({ code: 'INVALID_CODE' }, 400)
    const deletion = await confirmWebAccountDeletion(parsed.data.requestId, parsed.data.code)
    if (!deletion) return deletionJson({ code: 'INVALID_CODE' }, 400)
    return deletionJson({ ok: true, deletion, sessionsRevoked: true })
  } catch {
    return deletionJson({ code: 'SERVICE_UNAVAILABLE' }, 503)
  }
}
