import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyRoutePriceChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { propagateCategoryRoutePrice } from '@/lib/routePricePropagation'

const patchSchema = z.object({
  routeId: z.string().trim().min(1).optional(),
  vehicleId: z.string().trim().min(1).optional(),
  pricingScope: z.enum(['default', 'mainland', 'island']).optional(),
  amountNGN: z.number().int().positive().optional(),
  notes: z.string().trim().nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })

  try {
    const current = await prisma.routePrice.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: 'Route price not found. Please refresh and try again.' }, { status: 404 })

    const routeId = parsed.data.routeId ?? current.routeId
    const vehicleId = parsed.data.vehicleId ?? current.vehicleId
    const pricingScope = parsed.data.pricingScope ?? current.pricingScope
    const amountNGN = parsed.data.amountNGN ?? current.amountNGN
    const notes = Object.hasOwn(parsed.data, 'notes') ? parsed.data.notes : current.notes

    const existingTarget = await prisma.routePrice.findFirst({
      where: { routeId, vehicleId, pricingScope },
      select: { id: true },
    })

    if (existingTarget && existingTarget.id !== id) {
      const routePrice = await prisma.$transaction(async (tx) => {
        const updated = await tx.routePrice.update({
          where: { id: existingTarget.id },
          data: { amountNGN, notes },
        })
        await tx.routePrice.delete({ where: { id } })
        await propagateCategoryRoutePrice(tx, updated)
        return updated
      })
      await notifyRoutePriceChanged('updated', [
        ['Route ID', routePrice.routeId],
        ['Vehicle/fleet ID', routePrice.vehicleId],
        ['Pricing scope', routePrice.pricingScope],
        ['Amount', `NGN ${routePrice.amountNGN.toLocaleString()}`],
        ['Notes', routePrice.notes],
      ])
      await writeAuditLog({
        session: guard.session,
        req,
        action: 'merge_update',
        entityType: 'route_price',
        entityId: routePrice.id,
        metadata: {
          deletedDuplicateId: id,
          previous: current,
          next: routePrice,
        },
      })
      return NextResponse.json({ routePrice })
    }

    const routePrice = await prisma.$transaction(async (tx) => {
      const updated = await tx.routePrice.update({
        where: { id },
        data: { routeId, vehicleId, pricingScope, amountNGN, notes },
      })
      await propagateCategoryRoutePrice(tx, updated)
      return updated
    })
    await notifyRoutePriceChanged('updated', [
      ['Route ID', routePrice.routeId],
      ['Vehicle/fleet ID', routePrice.vehicleId],
      ['Pricing scope', routePrice.pricingScope],
      ['Amount', `NGN ${routePrice.amountNGN.toLocaleString()}`],
      ['Notes', routePrice.notes],
    ])
    await writeAuditLog({
      session: guard.session,
      req,
      action: 'update',
      entityType: 'route_price',
      entityId: routePrice.id,
      metadata: {
        previous: current,
        next: routePrice,
      },
    })
    return NextResponse.json({ routePrice })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'This route, vehicle, and pricing scope already have a price.' }, { status: 409 })
    }
    throw error
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const routePrice = await prisma.routePrice.findUnique({ where: { id } })
  await prisma.routePrice.delete({ where: { id } })
  await notifyRoutePriceChanged('deleted', [
    ['Route ID', routePrice?.routeId],
    ['Vehicle/fleet ID', routePrice?.vehicleId],
    ['Pricing scope', routePrice?.pricingScope],
    ['Amount', routePrice?.amountNGN ? `NGN ${routePrice.amountNGN.toLocaleString()}` : null],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'delete',
    entityType: 'route_price',
    entityId: id,
    metadata: { previous: routePrice },
  })
  return NextResponse.json({ ok: true })
}
