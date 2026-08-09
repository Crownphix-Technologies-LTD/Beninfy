import { NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/customer'
import { refreshStalePaystackPayments } from '@/lib/paymentMaintenance'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const customer = await requireCustomer()
  if (!customer.ok) return customer.response
  const { session } = customer
  await refreshStalePaystackPayments({ take: 50 })
  const payments = await prisma.payment.findMany({
    where: { booking: { userId: session.user!.id } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reference: true,
      amountNGN: true,
      status: true,
      createdAt: true,
      booking: { select: { id: true, from: true, to: true, date: true } },
    },
  })
  return NextResponse.json({ payments })
}
