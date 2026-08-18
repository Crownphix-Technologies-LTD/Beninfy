import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('payments')
  if (!guard.ok) return guard.response
  const { id } = await params

  const paymentResolution = await prisma.paymentResolution.findUnique({
    where: { id },
    include: {
      booking: {
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      },
      customer: { select: { id: true, name: true, email: true, phone: true } },
      payment: true,
    },
  })
  if (!paymentResolution) {
    return NextResponse.json({ error: 'Payment resolution not found' }, { status: 404 })
  }

  return NextResponse.json({ paymentResolution })
}
