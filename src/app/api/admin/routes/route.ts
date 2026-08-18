import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { ensureDefaultRoutes } from '@/lib/routeCatalog'

const schema = z.object({
  id: z.string().min(1).max(80),
  from: z.string().min(1),
  fromCode: z.string().nullable().optional(),
  fromCountry: z.string().nullable().optional(),
  to: z.string().min(1),
  toCode: z.string().nullable().optional(),
  toCountry: z.string().nullable().optional(),
  durationHours: z.number().positive(),
  available: z.boolean().optional(),
  popular: z.boolean().optional(),
  image: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionFr: z.string().nullable().optional(),
  borderCrossings: z.array(z.string()).optional(),
  borderFeeIds: z.array(z.string()).optional(),
})

export async function GET() {
  const guard = await requireAdminPermission('routes')
  if (!guard.ok) return guard.response
  await ensureDefaultRoutes()
  const routes = await prisma.route.findMany({ orderBy: { from: 'asc' } })
  return NextResponse.json({ routes })
}

export async function POST(req: Request) {
  const guard = await requireAdminPermission('routes')
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  const route = await prisma.route.create({ data: parsed.data })
  await notifyBackofficeRecordChanged('Route', 'created', [
    ['ID', route.id],
    ['From', route.from],
    ['To', route.to],
    ['Duration hours', route.durationHours],
    ['Available', route.available ? 'Yes' : 'No'],
    ['Popular', route.popular ? 'Yes' : 'No'],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'create',
    entityType: 'route',
    entityId: route.id,
    metadata: {
      from: route.from,
      to: route.to,
      durationHours: route.durationHours,
      popular: route.popular,
    },
  })
  return NextResponse.json({ route }, { status: 201 })
}
