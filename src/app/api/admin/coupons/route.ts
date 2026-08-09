import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { normalizeCouponCode } from '@/lib/coupons'
import { notifyCouponChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().nullable().optional()
)

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date').nullable().optional()
)

const schema = z.object({
  code: z.string().trim().min(1).max(60).transform(normalizeCouponCode),
  description: optionalText,
  discountType: z.enum(['fixed', 'percent']),
  amountNGN: z.number().int().positive().nullable().optional(),
  percent: z.number().int().min(1).max(100).nullable().optional(),
  active: z.boolean().default(true),
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

function couponData(data: z.infer<typeof schema>) {
  return {
    code: data.code,
    description: data.description,
    discountType: data.discountType,
    amountNGN: data.discountType === 'fixed' ? data.amountNGN : null,
    percent: data.discountType === 'percent' ? data.percent : null,
    active: data.active,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    minSpendNGN: data.minSpendNGN,
    maxRedemptions: data.maxRedemptions,
  }
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const coupons = await prisma.coupon.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] })
  return NextResponse.json({ coupons })
}

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })

  try {
    const coupon = await prisma.coupon.create({ data: couponData(parsed.data) })
    await notifyCouponChanged('created', [
      ['Code', coupon.code],
      ['Discount type', coupon.discountType],
      ['Amount', coupon.amountNGN ? `NGN ${coupon.amountNGN.toLocaleString()}` : null],
      ['Percent', coupon.percent ? `${coupon.percent}%` : null],
      ['Active', coupon.active ? 'Yes' : 'No'],
      ['Max redemptions', coupon.maxRedemptions],
    ])
    await writeAuditLog({
      session: guard.session,
      req,
      action: 'create',
      entityType: 'coupon',
      entityId: coupon.id,
      metadata: {
        code: coupon.code,
        discountType: coupon.discountType,
        amountNGN: coupon.amountNGN,
        percent: coupon.percent,
        active: coupon.active,
      },
    })
    return NextResponse.json({ coupon }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 })
    }
    throw error
  }
}
