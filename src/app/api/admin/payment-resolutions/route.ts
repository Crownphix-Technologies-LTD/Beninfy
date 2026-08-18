import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const guard = await requireAdminPermission('payments')
  if (!guard.ok) return guard.response

  const url = new URL(req.url)
  const status = url.searchParams.get('status') || undefined
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200)

  const paymentResolutions = await prisma.paymentResolution.findMany({
    where: status ? { status } : undefined,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      booking: {
        select: {
          id: true,
          from: true,
          to: true,
          date: true,
          status: true,
        },
      },
      customer: { select: { id: true, name: true, email: true } },
      payment: { select: { id: true, reference: true, status: true, amountNGN: true } },
    },
  })

  return NextResponse.json({ paymentResolutions })
}
