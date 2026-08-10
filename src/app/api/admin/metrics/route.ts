import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const guard = await requireAdminPermission('overview')
  if (!guard.ok) return guard.response

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [bookingsTotal, bookingsThisMonth, usersTotal, paymentsTotal, paidAgg, recentBookings, statusCounts] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.user.count(),
    prisma.payment.count(),
    prisma.payment.aggregate({
      where: { status: 'paid' },
      _sum: { amountNGN: true },
    }),
    prisma.booking.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        from: true,
        to: true,
        date: true,
        passengers: true,
        priceNGN: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        vehicle: { select: { id: true, name: true } },
      },
    }),
    prisma.booking.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ])

  return NextResponse.json({
    metrics: {
      bookingsTotal,
      bookingsThisMonth,
      usersTotal,
      paymentsTotal,
      revenuePaidNGN: paidAgg._sum.amountNGN ?? 0,
      statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
    },
    recentBookings,
  })
}
