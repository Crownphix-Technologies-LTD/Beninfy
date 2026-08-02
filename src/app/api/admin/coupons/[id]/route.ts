import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { normalizeCouponCode } from '@/lib/coupons'
import { prisma } from '@/lib/prisma'

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional()
)

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date').nullable().optional()
)

const patchSchema = z.object({
  code: z.string().trim().min(1).max(60).transform(normalizeCouponCode).optional(),
  description: optionalText,
  discountType: z.enum(['fixed', 'percent']).optional(),
  amountNGN: z.number().int().positive().nullable().optional(),
  percent: z.number().int().min(1).max(100).nullable().optional(),
  active: z.boolean().optional(),
  startsAt: optionalDate,
  expiresAt: optionalDate,
  minSpendNGN: z.number().int().nonnegative().nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.discountType === 'fixed' && !data.amountNGN) {
    ctx.addIssue({ code: 'custom', path: ['amountNGN'], message: 'Fixed coupons require amountNGN' })
  }
  if (data.discountType === 'percent' && !data.percent) {
    ctx.addIssue({ code: 'custom', path: ['percent'], message: 'Percent coupons require percent' })
  }
})

function couponPatchData(data: z.infer<typeof patchSchema>) {
  const patch: Record<string, unknown> = { ...data }
  if (data.startsAt !== undefined) patch.startsAt = data.startsAt ? new Date(data.startsAt) : null
  if (data.expiresAt !== undefined) patch.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
  if (data.discountType === 'fixed') {
    patch.percent = null
  }
  if (data.discountType === 'percent') {
    patch.amountNGN = null
  }
  return patch
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })

  try {
    const coupon = await prisma.coupon.update({ where: { id }, data: couponPatchData(parsed.data) })
    return NextResponse.json({ coupon })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 })
    }
    throw error
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await params
  const bookings = await prisma.booking.count({ where: { couponId: id } })
  if (bookings > 0) {
    return NextResponse.json({ error: 'Cannot delete: this coupon has already been used. Deactivate it instead.' }, { status: 409 })
  }
  await prisma.coupon.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
