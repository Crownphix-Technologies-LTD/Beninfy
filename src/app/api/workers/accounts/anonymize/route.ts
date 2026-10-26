import { requireWorkerSecret } from '@/lib/workerAuth'
import { anonymizeDueCustomerAccounts } from '@/lib/mobile/customerProduct'
import {
  accountDeletionWorkerMetrics,
  processAccountAvatarCleanups,
} from '@/lib/accountDeletionWorker'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const guard = requireWorkerSecret(req)
  if (!guard.ok) return guard.response

  const url = new URL(req.url)
  const take = Number(url.searchParams.get('take') ?? 25)
  if (!Number.isSafeInteger(take) || take < 1 || take > 100)
    return Response.json({ ok: false, code: 'INVALID_BATCH_SIZE' }, { status: 400 })
  const runId = randomUUID()
  console.info('account_deletion.worker_started', { runId })
  try {
    const before = await accountDeletionWorkerMetrics()
    const deadline = Date.now() + 45000
    const result = await anonymizeDueCustomerAccounts({ take, deadline })
    const cleanup = await processAccountAvatarCleanups({ take, deadline })
    const after = await accountDeletionWorkerMetrics()
    const ok = result.failed === 0 && cleanup.failed === 0 && after.blocked === 0
    const summary = {
      runId,
      ok,
      eligibleBefore: before.eligible,
      ...result,
      cleanup,
      backlog: after,
    }
    console.info('account_deletion.worker_completed', summary)
    return Response.json(summary, {
      status: ok ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    console.error('account_deletion.worker_failed', { runId, code: 'worker_unavailable' })
    return Response.json({ ok: false, runId, code: 'WORKER_UNAVAILABLE' }, { status: 503 })
  }
}
