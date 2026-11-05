import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validateCouponCode } from '@/lib/coupons'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  code: z.string().trim().min(1).max(60),
  amountNGN: z.number().int().nonnegative(),
  customerEmail: z.string().trim().email().optional(),
})

export async function POST(req: Request) {
  const rateLimit = await checkRateLimit({
    scope: 'coupon-validate',
    identifier: requestIp(req),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many coupon attempts' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const customer = parsed.data.customerEmail
    ? await prisma.user.findUnique({
        where: { email: parsed.data.customerEmail.toLowerCase() },
        select: { id: true },
      })
    : null
  const result = await validateCouponCode(parsed.data.code, parsed.data.amountNGN, prisma, {
    product: 'ride',
    userId: customer?.id,
    allowProspectiveCustomer: Boolean(parsed.data.customerEmail && !customer),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ coupon: result.coupon, discountNGN: result.discountNGN, finalAmountNGN: result.finalAmountNGN })
}
