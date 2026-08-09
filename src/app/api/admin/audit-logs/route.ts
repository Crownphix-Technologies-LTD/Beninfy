import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const url = new URL(req.url)
  const entityType = url.searchParams.get('entityType')?.trim()
  const action = url.searchParams.get('action')?.trim()
  const actor = url.searchParams.get('actor')?.trim()
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100), 1), 250)

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
      ...(actor
        ? {
            OR: [
              { actorEmail: { contains: actor, mode: 'insensitive' } },
              { actorId: { contains: actor, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ auditLogs })
}
