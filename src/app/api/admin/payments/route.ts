import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { refreshStalePaystackPayments } from '@/lib/paymentMaintenance'
import { prisma } from '@/lib/prisma'

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
