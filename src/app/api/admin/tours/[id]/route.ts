import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  titleFr: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  destinationFr: z.string().nullable().optional(),
  country: z.string().min(1).optional(),
  countryFr: z.string().nullable().optional(),
  durationDays: z.number().int().positive().optional(),
  startingFromNGN: z.number().int().positive().optional(),
  image: z.string().nullable().optional(),
  description: z.string().min(1).optional(),
  descriptionFr: z.string().nullable().optional(),
  highlights: z.array(z.string()).optional(),
  highlightsFr: z.array(z.string()).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  const current = await prisma.tour.findUnique({ where: { id } })
  const tour = await prisma.tour.update({ where: { id }, data: parsed.data })
  await notifyBackofficeRecordChanged('Tour', 'updated', [
    ['ID', tour.id],
    ['Title', tour.title],
    ['Country', tour.country],
    ['Duration days', tour.durationDays],
    ['Starting from', `NGN ${tour.startingFromNGN.toLocaleString()}`],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'update',
    entityType: 'tour',
    entityId: tour.id,
    metadata: { previous: current, next: tour },
  })
  return NextResponse.json({ tour })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params
  const tour = await prisma.tour.findUnique({ where: { id } })
  await prisma.tour.delete({ where: { id } })
  await notifyBackofficeRecordChanged('Tour', 'deleted', [
    ['ID', tour?.id],
    ['Title', tour?.title],
    ['Country', tour?.country],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'delete',
    entityType: 'tour',
    entityId: id,
    metadata: { previous: tour },
  })
  return NextResponse.json({ ok: true })
}
