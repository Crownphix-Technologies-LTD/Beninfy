import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  from: z.string().min(1).optional(),
  fromCode: z.string().nullable().optional(),
  fromCountry: z.string().nullable().optional(),
  to: z.string().min(1).optional(),
  toCode: z.string().nullable().optional(),
  toCountry: z.string().nullable().optional(),
  durationHours: z.number().positive().optional(),
  popular: z.boolean().optional(),
  image: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionFr: z.string().nullable().optional(),
  borderCrossings: z.array(z.string()).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  const route = await prisma.route.update({ where: { id }, data: parsed.data })
  await notifyBackofficeRecordChanged('Route', 'updated', [
    ['ID', route.id],
    ['From', route.from],
    ['To', route.to],
    ['Duration hours', route.durationHours],
    ['Popular', route.popular ? 'Yes' : 'No'],
  ])
  return NextResponse.json({ route })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const route = await prisma.route.findUnique({ where: { id } })
  await prisma.route.delete({ where: { id } })
  await notifyBackofficeRecordChanged('Route', 'deleted', [
    ['ID', route?.id],
    ['From', route?.from],
    ['To', route?.to],
  ])
  return NextResponse.json({ ok: true })
}
