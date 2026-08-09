import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { ensureDefaultTours } from '@/lib/tourCatalog'

const schema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1),
  titleFr: z.string().nullable().optional(),
  destination: z.string().nullable().optional(),
  destinationFr: z.string().nullable().optional(),
  country: z.string().min(1),
  countryFr: z.string().nullable().optional(),
  durationDays: z.number().int().positive(),
  startingFromNGN: z.number().int().positive(),
  image: z.string().nullable().optional(),
  description: z.string().min(1),
  descriptionFr: z.string().nullable().optional(),
  highlights: z.array(z.string()).optional(),
  highlightsFr: z.array(z.string()).optional(),
})

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  await ensureDefaultTours()
  const tours = await prisma.tour.findMany({ orderBy: { startingFromNGN: 'asc' } })
  return NextResponse.json({ tours })
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  const tour = await prisma.tour.create({ data: parsed.data })
  await notifyBackofficeRecordChanged('Tour', 'created', [
    ['ID', tour.id],
    ['Title', tour.title],
    ['Country', tour.country],
    ['Duration days', tour.durationDays],
    ['Starting from', `NGN ${tour.startingFromNGN.toLocaleString()}`],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'create',
    entityType: 'tour',
    entityId: tour.id,
    metadata: {
      title: tour.title,
      country: tour.country,
      durationDays: tour.durationDays,
      startingFromNGN: tour.startingFromNGN,
    },
  })
  return NextResponse.json({ tour }, { status: 201 })
}
