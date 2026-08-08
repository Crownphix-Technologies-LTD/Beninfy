import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import {
  getPaystackConfigurationError,
  getPaystackSecret,
  settlePaymentFromPaystack,
  verifyPaystackTransaction,
} from '@/lib/paystack'
import { prisma } from '@/lib/prisma'

async function refreshStalePaystackPayments() {
  if (getPaystackConfigurationError()) return
  const secret = getPaystackSecret()
  if (!secret) return

  const staleBefore = new Date(Date.now() - 20 * 60 * 1000)
  const payments = await prisma.payment.findMany({
    where: {
      provider: 'paystack',
      status: 'pending',
      createdAt: { lt: staleBefore },
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
    select: { reference: true },
  })

  for (const payment of payments) {
    try {
      const verified = await verifyPaystackTransaction(secret, payment.reference)
      await settlePaymentFromPaystack(payment.reference, verified)
    } catch (error) {
      console.error('Failed to refresh stale Paystack payment', {
        reference: payment.reference,
        error,
      })
    }
  }
}

export async function GET(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? undefined
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const where = status ? { status } : {}
  if (!status || status === 'pending') {
    await refreshStalePaystackPayments()
  }
  const payments = await prisma.payment.findMany({
    where,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      booking: {
        select: {
          id: true, from: true, to: true, date: true, priceNGN: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })
  return NextResponse.json({ payments })
}
