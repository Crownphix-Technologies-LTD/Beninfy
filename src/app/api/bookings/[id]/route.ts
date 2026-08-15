import { NextResponse } from 'next/server'
import { requireCustomer } from '@/lib/customer'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await requireCustomer()
  if (!customer.ok) return customer.response
  const { session } = customer
  const { id } = await params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking || booking.userId !== session.user!.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ booking })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const customer = await requireCustomer()
  if (!customer.ok) return customer.response
  const { session } = customer
  const { id } = await params
  const booking = await prisma.booking.findUnique({ where: { id } })
  if (!booking || booking.userId !== session.user!.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (booking.status === 'completed') {
    return NextResponse.json({ error: 'Cannot cancel a completed booking' }, { status: 409 })
  }
  const now = new Date()
  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: 'cancelled',
      legs: {
        updateMany: {
          where: { status: { notIn: ['completed', 'cancelled'] } },
          data: {
            status: 'cancelled',
            cancelledAt: now,
            cancelledBy: 'customer',
          },
        },
      },
    },
  })
  return NextResponse.json({ booking: updated })
}
