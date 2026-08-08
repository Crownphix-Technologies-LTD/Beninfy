import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { notifyBookingStatusChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']),
})

function legStatusForBookingStatus(status: z.infer<typeof patchSchema>['status']) {
  if (status === 'confirmed') return 'reserved'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'completed') return 'completed'
  return 'payment_pending'
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const current = await prisma.booking.findUnique({ where: { id }, select: { status: true } })
  if (!current) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  const booking = await prisma.booking.update({
    where: { id },
    data: {
      status: parsed.data.status,
      legs: {
        updateMany: {
          where: {},
          data: { status: legStatusForBookingStatus(parsed.data.status) },
        },
      },
    },
  })
  if (current.status !== booking.status) {
    await notifyBookingStatusChanged(booking.id, booking.status)
  }
  return NextResponse.json({ booking })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  await prisma.payment.deleteMany({ where: { bookingId: id } })
  await prisma.booking.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
