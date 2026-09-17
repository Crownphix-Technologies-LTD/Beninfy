import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { CANONICAL_TOUR_IDS } from '@/lib/tourCommercial'
import { archiveOrDeleteTour } from '@/lib/admin/tourCommercial'

const patchSchema = z.object({
  active: z.boolean().optional(),
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
  if (parsed.data.active && !CANONICAL_TOUR_IDS.includes(id as typeof CANONICAL_TOUR_IDS[number]))
    return NextResponse.json({ error: 'Only canonical Tour products can be active' }, { status: 400 })
  if (CANONICAL_TOUR_IDS.includes(id as typeof CANONICAL_TOUR_IDS[number]) &&
      ((parsed.data.durationDays !== undefined && parsed.data.durationDays !== 1) || parsed.data.startingFromNGN !== undefined))
    return NextResponse.json({ error: 'Canonical Tours are one day. Change prices in Tour vehicle rates.' }, { status: 400 })
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
  // Archive referenced products and canonical products; never remove history.
  const { archived } = await archiveOrDeleteTour(id)
  await notifyBackofficeRecordChanged('Tour', 'deleted', [
    ['ID', tour?.id],
    ['Title', tour?.title],
    ['Country', tour?.country],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: archived ? 'archive' : 'delete',
    entityType: 'tour',
    entityId: id,
    metadata: { previous: tour },
  })
  return NextResponse.json({ ok: true, archived })
}
