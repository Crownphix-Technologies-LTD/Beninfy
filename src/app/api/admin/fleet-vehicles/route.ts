import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { notifyFleetVehicleChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional()
)

const schema = z.object({
  vehicleId: z.string().trim().min(1),
  label: z.string().trim().min(1).max(120),
  plateNumber: z.string().trim().min(1).max(40),
  color: optionalText,
  status: z.enum(['available', 'maintenance', 'inactive']).default('available'),
  currentCity: optionalText,
  notes: optionalText,
})

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  try {
    const fleetVehicles = await prisma.fleetVehicle.findMany({
      orderBy: [{ status: 'asc' }, { label: 'asc' }],
      include: { vehicle: { select: { id: true, name: true } } },
    })
    return NextResponse.json({ fleetVehicles })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') {
      const fleetVehicles = await prisma.fleetVehicle.findMany({
        orderBy: [{ status: 'asc' }, { label: 'asc' }],
        select: {
          id: true,
          vehicleId: true,
          label: true,
          plateNumber: true,
          status: true,
          currentCity: true,
          notes: true,
          vehicle: { select: { id: true, name: true } },
        },
      })
      return NextResponse.json({ fleetVehicles: fleetVehicles.map((unit) => ({ ...unit, color: null })) })
    }
    throw error
  }
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  try {
    const fleetVehicle = await prisma.fleetVehicle.create({ data: parsed.data })
    await notifyFleetVehicleChanged('created', [
      ['Label', fleetVehicle.label],
      ['Plate number', fleetVehicle.plateNumber],
      ['Color', fleetVehicle.color],
      ['Category ID', fleetVehicle.vehicleId],
      ['Status', fleetVehicle.status],
      ['Current city', fleetVehicle.currentCity],
    ])
    return NextResponse.json({ fleetVehicle }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ error: 'A fleet unit with this plate number already exists' }, { status: 409 })
      }
      if (error.code === 'P2003') {
        return NextResponse.json({ error: 'Selected vehicle type does not exist' }, { status: 400 })
      }
    }
    throw error
  }
}
