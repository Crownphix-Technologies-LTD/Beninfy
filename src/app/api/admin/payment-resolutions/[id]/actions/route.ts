import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import {
  isPaymentResolutionAction,
  transitionPaymentResolution,
} from '@/lib/paymentResolutions'

const schema = z.object({
  action: z.string().trim(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('payments')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success || !isPaymentResolutionAction(parsed.data.action)) {
    return NextResponse.json({ error: 'Invalid payment resolution action' }, { status: 400 })
  }

  const result = await transitionPaymentResolution({ id, action: parsed.data.action })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  await notifyBackofficeRecordChanged('Payment resolution', 'updated', [
    ['ID', result.paymentResolution.id],
    ['Booking', result.paymentResolution.bookingId],
    ['Payment', result.paymentResolution.payment.reference],
    ['Customer', result.paymentResolution.customer.email],
    ['Status', result.paymentResolution.status],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: parsed.data.action,
    entityType: 'payment_resolution',
    entityId: result.paymentResolution.id,
    metadata: {
      bookingId: result.paymentResolution.bookingId,
      paymentId: result.paymentResolution.paymentId,
      status: result.paymentResolution.status,
    },
  })

  return NextResponse.json({ paymentResolution: result.paymentResolution })
}
