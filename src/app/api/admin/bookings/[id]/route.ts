import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyBookingStatusChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'ops_review', 'cancelled', 'completed']),
})

function legStatusForBookingStatus(status: z.infer<typeof patchSchema>['status']) {
  if (status === 'confirmed') return 'reserved'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'completed') return 'completed'
  if (status === 'ops_review') return 'payment_pending'
  return 'payment_pending'
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('bookings')
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
    await writeAuditLog({
      session: guard.session,
      req,
      action: 'status_update',
      entityType: 'booking',
      entityId: booking.id,
      metadata: {
        previousStatus: current.status,
        nextStatus: booking.status,
      },
    })
  }
  return NextResponse.json({ booking })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('bookings')
  if (!guard.ok) return guard.response
  const { id } = await params
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, from: true, to: true, date: true, status: true, priceNGN: true, passengerEmail: true },
  })
  await prisma.payment.deleteMany({ where: { bookingId: id } })
  await prisma.booking.delete({ where: { id } })
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'delete',
    entityType: 'booking',
    entityId: id,
    metadata: { previous: booking },
  })
  return NextResponse.json({ ok: true })
}
