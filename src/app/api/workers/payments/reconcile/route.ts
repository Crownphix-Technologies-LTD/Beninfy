import { refreshStalePayments } from '@/lib/paymentMaintenance'
import { requireWorkerSecret } from '@/lib/workerAuth'

export const runtime = 'nodejs'

async function run(req: Request) {
  const guard = requireWorkerSecret(req)
  if (!guard.ok) return guard.response

  const body =
    req.method === 'GET'
      ? {}
      : ((await req.json().catch(() => ({}))) as {
          take?: number
          staleMinutes?: number
        })
  const result = await refreshStalePayments({
    take: Math.min(Math.max(Number(body.take ?? 50), 1), 200),
    staleMinutes: Math.min(Math.max(Number(body.staleMinutes ?? 20), 5), 24 * 60),
  })

  return Response.json({ ok: true, result })
}

export const GET = run
export const POST = run
