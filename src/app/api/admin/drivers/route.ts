import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyDriverChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional()
)

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().email().nullable().optional()
  ),
  status: z.enum(['available', 'off_duty', 'inactive']).default('available'),
  homeCity: optionalText,
  licenseNumber: optionalText,
  notes: optionalText,
})

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const drivers = await prisma.driver.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] })
  return NextResponse.json({ drivers })
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  try {
    const driver = await prisma.driver.create({ data: parsed.data })
    await notifyDriverChanged('created', [
      ['Name', driver.name],
      ['Phone', driver.phone],
      ['Email', driver.email],
      ['Status', driver.status],
      ['Home city', driver.homeCity],
      ['License number', driver.licenseNumber],
    ])
    await writeAuditLog({
      session: guard.session,
      req,
      action: 'create',
      entityType: 'driver',
      entityId: driver.id,
      metadata: {
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        status: driver.status,
        homeCity: driver.homeCity,
      },
    })
    return NextResponse.json({ driver }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A driver with this unique value already exists' }, { status: 409 })
    }
    throw error
  }
}
