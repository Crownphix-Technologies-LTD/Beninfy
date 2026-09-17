import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { approveTourOperationsQuote, findTourBookingQuote } from '@/lib/admin/tourCommercial'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params
  const result = await findTourBookingQuote(id)
  if (!result) return Response.json({ error: 'Tour booking not found' }, { status: 404 })
  return Response.json(result.response)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params
  const result = await approveTourOperationsQuote(id, await req.json().catch(() => null))
  if (!result.ok) return Response.json(result, { status: result.status })
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'update',
    entityType: 'tour_quote',
    entityId: id,
    metadata: { previous: result.previous, priceNGN: result.priceNGN },
  })
  const updated = await findTourBookingQuote(id)
  return Response.json(updated!.response)
}
