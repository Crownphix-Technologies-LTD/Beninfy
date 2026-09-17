import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { prisma } from '@/lib/prisma'
import { CANONICAL_TOUR_IDS, TOUR_PRICING_CATEGORIES } from '@/lib/tourCommercial'

const schema = z.object({
  priceNGN: z.number().int().min(5).max(5_000_000).multipleOf(5),
  active: z.boolean(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params
  if (!TOUR_PRICING_CATEGORIES.includes(id as (typeof TOUR_PRICING_CATEGORIES)[number]))
    return Response.json({ error: 'Unknown Tour pricing category' }, { status: 404 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return Response.json(
      { error: 'Invalid price', issues: parsed.error.flatten() },
      { status: 400 }
    )
  const previous = await prisma.tourCommercialRate.findUnique({ where: { id } })
  if (!previous) return Response.json({ error: 'Rate not configured' }, { status: 404 })
  const rate = await prisma.$transaction(async (tx) => {
    const updated = await tx.tourCommercialRate.update({
      where: { id },
      data: { priceMinor: parsed.data.priceNGN * 100, active: parsed.data.active },
    })
    if (id === 'sedan')
      await tx.tour.updateMany({
        where: { id: { in: [...CANONICAL_TOUR_IDS] } },
        data: { startingFromNGN: parsed.data.priceNGN },
      })
    return updated
  })
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'update',
    entityType: 'tour_rate',
    entityId: id,
    metadata: { previous, next: rate },
  })
  return Response.json({ rate: { ...rate, priceNGN: rate.priceMinor / 100 } })
}
