import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { listAdminTourFeedback } from '@/lib/admin/tourFeedback'

export const runtime = 'nodejs'
const query = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  flagged: z.enum(['true', 'false']).optional(),
})

export async function GET(req: Request) {
  const guard = await requireAdminPermission('tour_feedback')
  if (!guard.ok) return guard.response
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return Response.json({ error: 'Invalid filters' }, { status: 400 })
  const result = await listAdminTourFeedback({
    ...parsed.data,
    flagged: parsed.data.flagged === undefined ? undefined : parsed.data.flagged === 'true',
  })
  return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}
