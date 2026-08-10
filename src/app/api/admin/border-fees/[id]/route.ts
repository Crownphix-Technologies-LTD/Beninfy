import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminPermission } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  country: z.string().min(1).optional(),
  countryFr: z.string().nullable().optional(),
  border: z.string().min(1).optional(),
  borderFr: z.string().nullable().optional(),
  countries: z.array(z.string()).optional(),
  feePerPersonNGN: z.number().int().nonnegative().optional(),
  feeRoundTripNGN: z.number().int().nonnegative().optional(),
  popular: z.boolean().optional(),
  icon: z.string().nullable().optional(),
  services: z.array(z.string()).optional(),
  servicesFr: z.array(z.string()).optional(),
  documents: z.array(z.string()).optional(),
  documentsFr: z.array(z.string()).optional(),
  tips: z.array(z.string()).optional(),
  tipsFr: z.array(z.string()).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('border_fees')
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  const current = await prisma.borderFee.findUnique({ where: { id } })
  const borderFee = await prisma.borderFee.update({ where: { id }, data: parsed.data })
  await notifyBackofficeRecordChanged('Border fee', 'updated', [
    ['ID', borderFee.id],
    ['Country', borderFee.country],
    ['Border', borderFee.border],
    ['One-way fee', `NGN ${borderFee.feePerPersonNGN.toLocaleString()}`],
    ['Round-trip fee', `NGN ${borderFee.feeRoundTripNGN.toLocaleString()}`],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'update',
    entityType: 'border_fee',
    entityId: borderFee.id,
    metadata: { previous: current, next: borderFee },
  })
  return NextResponse.json({ borderFee })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminPermission('border_fees')
  if (!guard.ok) return guard.response
  const { id } = await params
  const borderFee = await prisma.borderFee.findUnique({ where: { id } })
  await prisma.borderFee.delete({ where: { id } })
  await notifyBackofficeRecordChanged('Border fee', 'deleted', [
    ['ID', borderFee?.id],
    ['Country', borderFee?.country],
    ['Border', borderFee?.border],
  ])
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'delete',
    entityType: 'border_fee',
    entityId: id,
    metadata: { previous: borderFee },
  })
  return NextResponse.json({ ok: true })
}
