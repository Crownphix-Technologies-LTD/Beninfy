import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyRoutePriceChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { ensureDefaultRoutePrices } from '@/lib/routePriceCatalog'
import { propagateCategoryRoutePrice } from '@/lib/routePricePropagation'

const schema = z.object({
  routeId: z.string().trim().min(1),
  vehicleId: z.string().trim().min(1),
  pricingScope: z.enum(['default', 'mainland', 'island']).default('default'),
  amountNGN: z.number().int().positive(),
  notes: z.string().trim().nullable().optional(),
})

export async function GET() {
  const guard = await requireAdminPermission('pricing')
  if (!guard.ok) return guard.response
  await ensureDefaultRoutePrices()
  const routePrices = await prisma.routePrice.findMany({
    orderBy: [{ routeId: 'asc' }, { vehicleId: 'asc' }, { pricingScope: 'asc' }],
    include: {
      route: { select: { id: true, from: true, to: true } },
    },
  })
  return NextResponse.json({ routePrices })
}

export async function POST(req: Request) {
  const guard = await requireAdminPermission('pricing')
  if (!guard.ok) return guard.response
  await ensureDefaultRoutePrices()
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })

  try {
    const routePrice = await prisma.$transaction(async (tx) => {
      const created = await tx.routePrice.create({ data: parsed.data })
      await propagateCategoryRoutePrice(tx, created)
      return created
    })
    await notifyRoutePriceChanged('created', [
      ['Route ID', routePrice.routeId],
      ['Vehicle/fleet ID', routePrice.vehicleId],
      ['Pricing scope', routePrice.pricingScope],
      ['Amount', `NGN ${routePrice.amountNGN.toLocaleString()}`],
      ['Notes', routePrice.notes],
    ])
    await writeAuditLog({
      session: guard.session,
      req,
      action: 'create',
      entityType: 'route_price',
      entityId: routePrice.id,
      metadata: {
        routeId: routePrice.routeId,
        vehicleId: routePrice.vehicleId,
        pricingScope: routePrice.pricingScope,
        amountNGN: routePrice.amountNGN,
      },
    })
    return NextResponse.json({ routePrice }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ error: 'This route, vehicle, and pricing scope already have a price. Edit the existing price instead.' }, { status: 409 })
      }
      if (error.code === 'P2003') {
        return NextResponse.json({ error: 'Selected route does not exist' }, { status: 400 })
      }
    }
    throw error
  }
}
