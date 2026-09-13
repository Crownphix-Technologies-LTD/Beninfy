import { requireWorkerSecret } from '@/lib/workerAuth'
import { anonymizeDueCustomerAccounts } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const guard = requireWorkerSecret(req)
  if (!guard.ok) return guard.response

  const url = new URL(req.url)
  const take = Number(url.searchParams.get('take') ?? 25)
  const result = await anonymizeDueCustomerAccounts({ take })

  return Response.json({
    ok: true,
    processed: result.processed,
    checked: result.checked,
  })
}
