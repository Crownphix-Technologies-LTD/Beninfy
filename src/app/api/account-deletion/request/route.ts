import { after } from 'next/server'
import { isEmailConfigured } from '@/lib/email'
import { checkRateLimit } from '@/lib/rateLimit'
import { newDeletionRequestId, sendWebDeletionChallenge } from '@/lib/webAccountDeletion'
import {
  deletionIpLimit,
  deletionJson,
  deletionRequestAllowed,
  deletionRequestSchema,
  readDeletionBody,
} from '@/lib/webAccountDeletionHttp'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!deletionRequestAllowed(req)) return deletionJson({ code: 'REQUEST_REJECTED' }, 403)
  try {
    if (!(await deletionIpLimit(req, 'request')).allowed)
      return deletionJson({ code: 'RATE_LIMITED' }, 429)
    const parsed = deletionRequestSchema.safeParse(await readDeletionBody(req))
    if (!parsed.success) return deletionJson({ code: 'INVALID_REQUEST' }, 400)
    if (!isEmailConfigured()) return deletionJson({ code: 'SERVICE_UNAVAILABLE' }, 503)
    const requestId = newDeletionRequestId()
    // Limits are independent of account existence, and target throttling is not disclosed.
    const target = await checkRateLimit({
      scope: 'web-account-deletion-email',
      identifier: parsed.data.email,
      limit: 3,
      windowMs: 3600000,
    })
    const global = await checkRateLimit({
      scope: 'web-account-deletion-global',
      identifier: 'email',
      limit: 100,
      windowMs: 3600000,
    })
    if (target.allowed && global.allowed && !parsed.data.website) {
      after(async () => {
        try {
          await sendWebDeletionChallenge({
            requestId,
            email: parsed.data.email,
            locale: parsed.data.locale,
          })
        } catch {
          console.warn('account_deletion.challenge_unavailable')
        }
      })
    }
    return deletionJson({ ok: true, requestId }, 202)
  } catch {
    return deletionJson({ code: 'SERVICE_UNAVAILABLE' }, 503)
  }
}
