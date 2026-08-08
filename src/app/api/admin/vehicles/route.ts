import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { ensureDefaultVehicles } from '@/lib/vehicleCatalog'

const schema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  nameFr: z.string().nullable().optional(),
  capacity: z.number().int().positive(),
  luggageCapacity: z.number().int().nonnegative().optional(),
  available: z.boolean().optional(),
  image: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionFr: z.string().nullable().optional(),
  badge: z.string().nullable().optional(),
  badgeFr: z.string().nullable().optional(),
  features: z.array(z.string()).optional(),
  featuresFr: z.array(z.string()).optional(),
  basePriceNGN: z.number().int().positive().nullable().optional(),
})

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  await ensureDefaultVehicles()
  const vehicles = await prisma.vehicle.findMany({ orderBy: { capacity: 'asc' } })
  return NextResponse.json({ vehicles })
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  try {
    const vehicle = await prisma.vehicle.create({ data: parsed.data })
    await notifyBackofficeRecordChanged('Vehicle category', 'created', [
      ['ID', vehicle.id],
      ['Name', vehicle.name],
      ['Capacity', vehicle.capacity],
      ['Available', vehicle.available ? 'Yes' : 'No'],
      ['Base price', vehicle.basePriceNGN ? `NGN ${vehicle.basePriceNGN.toLocaleString()}` : null],
    ])
    return NextResponse.json({ vehicle }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        {
          error: `Vehicle category slug "${parsed.data.id}" already exists. Edit that category instead, or create a new customer-facing category such as "executive-suv" or "minibus". Physical car models belong under Fleet units.`,
        },
        { status: 409 }
      )
    }
    throw error
  }
}
