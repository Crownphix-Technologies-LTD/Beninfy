import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { prisma } from '@/lib/prisma'
import {
  toTourItineraryDto,
  tourExecutionReadiness,
  tourItineraryCreateData,
  validateTourItineraryTemplate,
} from '@/lib/tourItinerary'

export const runtime = 'nodejs'

const stopSchema = z.object({
  sortOrder: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  titleFr: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(1200).nullable().optional(),
  descriptionFr: z.string().trim().max(1200).nullable().optional(),
  address: z.string().trim().min(1).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  estimatedDurationMinutes: z.number().int().positive().max(24 * 60).nullable().optional(),
  required: z.boolean().optional(),
})

const daySchema = z.object({
  dayNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  titleFr: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(1600).nullable().optional(),
  descriptionFr: z.string().trim().max(1600).nullable().optional(),
  defaultStartLabel: z.string().trim().max(160).nullable().optional(),
  defaultStartAddress: z.string().trim().max(300).nullable().optional(),
  defaultStartLatitude: z.number().min(-90).max(90).nullable().optional(),
  defaultStartLongitude: z.number().min(-180).max(180).nullable().optional(),
  defaultEndLabel: z.string().trim().max(160).nullable().optional(),
  defaultEndAddress: z.string().trim().max(300).nullable().optional(),
  defaultEndLatitude: z.number().min(-90).max(90).nullable().optional(),
  defaultEndLongitude: z.number().min(-180).max(180).nullable().optional(),
  stops: z.array(stopSchema).default([]),
})

const schema = z.object({
  days: z.array(daySchema).max(30),
})

async function findTourWithItinerary(id: string) {
  return prisma.tour.findUnique({
    where: { id },
    include: {
      itineraryDays: {
        orderBy: { dayNumber: 'asc' },
        include: { stops: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params

  const tour = await findTourWithItinerary(id)
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 })
  const readiness = tourExecutionReadiness(tour)

  return NextResponse.json({
    tourId: tour.id,
    itineraryDays: toTourItineraryDto(tour),
    executionReady: readiness.executionReady,
    executionReadinessReason: readiness.reason,
  })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const validated = validateTourItineraryTemplate(parsed.data.days)
  if (!validated.ok) {
    return NextResponse.json({ error: 'Invalid itinerary', code: validated.code }, { status: 400 })
  }

  const existing = await prisma.tour.findUnique({ where: { id }, select: { id: true, title: true } })
  if (!existing) return NextResponse.json({ error: 'Tour not found' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.tourItineraryDay.deleteMany({ where: { tourId: id } })
    await tx.tour.update({
      where: { id },
      data: {
        itineraryDays: {
          create: tourItineraryCreateData(validated.days),
        },
      },
    })
  })

  const tour = await findTourWithItinerary(id)
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 })
  const readiness = tourExecutionReadiness(tour)

  await writeAuditLog({
    session: guard.session,
    req,
    action: 'update_itinerary',
    entityType: 'tour',
    entityId: id,
    metadata: {
      title: existing.title,
      dayCount: tour.itineraryDays.length,
      stopCount: tour.itineraryDays.reduce((sum, day) => sum + day.stops.length, 0),
      executionReady: readiness.executionReady,
    },
  })

  return NextResponse.json({
    tourId: tour.id,
    itineraryDays: toTourItineraryDto(tour),
    executionReady: readiness.executionReady,
    executionReadinessReason: readiness.reason,
  })
}
