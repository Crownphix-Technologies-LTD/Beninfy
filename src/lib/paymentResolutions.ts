import type { Prisma } from '@prisma/client'
import { notifyPaymentResolutionPush } from '@/lib/mobile/notifications'
import { prisma } from '@/lib/prisma'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

export const PAYMENT_RESOLUTION_ACTIONS = [
  'start_review',
  'approve',
  'mark_processing',
  'complete',
  'reject',
] as const

export type PaymentResolutionAction = (typeof PAYMENT_RESOLUTION_ACTIONS)[number]

export const PAYMENT_RESOLUTION_TRANSITIONS: Record<
  PaymentResolutionAction,
  { from: string[]; to: string; timestamp: keyof Prisma.PaymentResolutionUpdateInput }
> = {
  start_review: {
    from: ['review_required'],
    to: 'under_review',
    timestamp: 'reviewedAt',
  },
  approve: {
    from: ['under_review'],
    to: 'approved',
    timestamp: 'approvedAt',
  },
  mark_processing: {
    from: ['approved'],
    to: 'processing',
    timestamp: 'processingAt',
  },
  complete: {
    from: ['processing'],
    to: 'completed',
    timestamp: 'completedAt',
  },
  reject: {
    from: ['under_review'],
    to: 'rejected',
    timestamp: 'rejectedAt',
  },
}

export function isPaymentResolutionAction(value: unknown): value is PaymentResolutionAction {
  return typeof value === 'string' && PAYMENT_RESOLUTION_ACTIONS.includes(value as PaymentResolutionAction)
}

export async function transitionPaymentResolution(input: {
  id: string
  action: PaymentResolutionAction
  client?: PrismaClientLike
}) {
  const client = input.client ?? prisma
  const transition = PAYMENT_RESOLUTION_TRANSITIONS[input.action]
  const current = await client.paymentResolution.findUnique({
    where: { id: input.id },
    include: {
      booking: { select: { id: true, from: true, to: true } },
      customer: { select: { id: true, email: true, name: true } },
      payment: { select: { id: true, reference: true, status: true } },
    },
  })
  if (!current) return { ok: false as const, status: 404, error: 'Payment resolution not found' }
  if (!transition.from.includes(current.status)) {
    return {
      ok: false as const,
      status: 409,
      error: `Cannot ${input.action.replace(/_/g, ' ')} from ${current.status}`,
    }
  }

  const updated = await client.paymentResolution.update({
    where: { id: input.id },
    data: {
      status: transition.to,
      customerMessageCode: customerMessageCodeForStatus(transition.to),
      [transition.timestamp]: new Date(),
    },
    include: {
      booking: { select: { id: true, from: true, to: true } },
      customer: { select: { id: true, email: true, name: true } },
      payment: { select: { id: true, reference: true, status: true } },
    },
  })

  await notifyPaymentResolutionPush({
    paymentResolutionId: updated.id,
    bookingId: updated.bookingId,
    paymentId: updated.paymentId,
    customerId: updated.customerId,
    status: updated.status,
  }).catch((error) => {
    console.warn('Payment resolution notification failed', {
      paymentResolutionId: updated.id,
      status: updated.status,
      error: error instanceof Error ? error.message : 'unknown',
    })
  })

  return { ok: true as const, paymentResolution: updated }
}

function customerMessageCodeForStatus(status: string) {
  switch (status) {
    case 'under_review':
      return 'refund_under_review'
    case 'approved':
      return 'refund_approved'
    case 'processing':
      return 'refund_processing'
    case 'completed':
      return 'refund_completed'
    case 'rejected':
      return 'refund_rejected'
    default:
      return 'refund_review_required'
  }
}
