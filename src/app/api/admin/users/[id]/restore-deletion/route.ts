import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { restorePendingCustomerDeletion } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  const result = await restorePendingCustomerDeletion({ userId: id })
  if (!result.ok) {
    return NextResponse.json({ error: 'No pending customer deletion found' }, { status: 404 })
  }

  await writeAuditLog({
    session: guard.session,
    req,
    action: 'restore_deletion',
    entityType: 'user',
    entityId: id,
    metadata: { cancelledAt: result.cancelledAt },
  })

  return NextResponse.json({ ok: true, cancelledAt: result.cancelledAt })
}
