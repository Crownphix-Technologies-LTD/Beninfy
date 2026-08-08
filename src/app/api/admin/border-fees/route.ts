import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  id: z.string().min(1).max(80),
  country: z.string().min(1),
  countryFr: z.string().nullable().optional(),
  border: z.string().min(1),
  borderFr: z.string().nullable().optional(),
  countries: z.array(z.string()).optional(),
  feePerPersonNGN: z.number().int().nonnegative(),
  feeRoundTripNGN: z.number().int().nonnegative(),
  popular: z.boolean().optional(),
  icon: z.string().nullable().optional(),
  services: z.array(z.string()).optional(),
  servicesFr: z.array(z.string()).optional(),
  documents: z.array(z.string()).optional(),
  documentsFr: z.array(z.string()).optional(),
  tips: z.array(z.string()).optional(),
  tipsFr: z.array(z.string()).optional(),
})

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const borderFees = await prisma.borderFee.findMany({ orderBy: { country: 'asc' } })
  return NextResponse.json({ borderFees })
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  const borderFee = await prisma.borderFee.create({ data: parsed.data })
  await notifyBackofficeRecordChanged('Border fee', 'created', [
    ['ID', borderFee.id],
    ['Country', borderFee.country],
    ['Border', borderFee.border],
    ['One-way fee', `NGN ${borderFee.feePerPersonNGN.toLocaleString()}`],
    ['Round-trip fee', `NGN ${borderFee.feeRoundTripNGN.toLocaleString()}`],
  ])
  return NextResponse.json({ borderFee }, { status: 201 })
}
