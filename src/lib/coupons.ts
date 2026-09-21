import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

export type CouponValidationResult =
  | {
      ok: true
      coupon: {
        id: string
        code: string
        description: string | null
        discountType: string
        amountNGN: number | null
        percent: number | null
        maxDiscountNGN: number | null
      }
      discountNGN: number
      finalAmountNGN: number
    }
  | { ok: false; error: string }

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

export async function validateCouponCode(
  rawCode: string,
  amountNGN: number,
  client: PrismaClientLike = prisma,
  context: { product?: 'ride' | 'tour'; userId?: string; excludeTourBookingId?: string } = {}
): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(rawCode)
  if (!code) return { ok: false, error: 'Enter a coupon code' }
  const eligibleAmountNGN = normalizeIntegerMoney(amountNGN) ?? 0

  const coupon = await client.coupon.findUnique({ where: { code } })
  if (!coupon) return { ok: false, error: 'Coupon code was not found' }
  if (!coupon.active) return { ok: false, error: 'Coupon code is inactive' }
  const applicability = coupon.applicability ?? 'ride'
  if (applicability !== 'both' && applicability !== (context.product ?? 'ride')) {
    return { ok: false, error: 'Coupon is not applicable to this product' }
  }

  const now = new Date()
  if (coupon.startsAt && coupon.startsAt > now)
    return { ok: false, error: 'Coupon code is not active yet' }
  if (coupon.expiresAt && coupon.expiresAt < now)
    return { ok: false, error: 'Coupon code has expired' }
  const minSpendNGN = normalizeIntegerMoney(coupon.minSpendNGN)
  if (minSpendNGN && eligibleAmountNGN < minSpendNGN) {
    return {
      ok: false,
      error: `Coupon requires a minimum spend of NGN ${minSpendNGN.toLocaleString()}`,
    }
  }
  const maxRedemptions = normalizeIntegerMoney(coupon.maxRedemptions)
  const redeemedCount = normalizeIntegerMoney(coupon.redeemedCount) ?? 0
  const heldWhere = {
    couponId: coupon.id,
    status: 'reserved',
    ...(context.excludeTourBookingId
      ? { tourBookingId: { not: context.excludeTourBookingId } }
      : {}),
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  }
  const held = maxRedemptions ? await client.tourCouponUse.count({ where: heldWhere }) : 0
  if (maxRedemptions && redeemedCount + held >= maxRedemptions) {
    return { ok: false, error: 'Coupon code has reached its usage limit' }
  }
  if (coupon.maxPerCustomer) {
    if (!context.userId) return { ok: false, error: 'Sign in to check customer coupon eligibility' }
    const rides = await client.booking.count({
      where: { couponId: coupon.id, userId: context.userId },
    })
    const tours = await client.tourCouponUse.count({
      where: {
        couponId: coupon.id,
        userId: context.userId,
        ...(context.excludeTourBookingId
          ? { tourBookingId: { not: context.excludeTourBookingId } }
          : {}),
        OR: [{ status: 'redeemed' }, { ...heldWhere }],
      },
    })
    if (rides + tours >= coupon.maxPerCustomer)
      return { ok: false, error: 'Customer coupon usage limit reached' }
  }

  const percent = normalizeIntegerMoney(coupon.percent) ?? 0
  const fixedAmountNGN = normalizeIntegerMoney(coupon.amountNGN) ?? 0
  const rawDiscount =
    coupon.discountType === 'percent'
      ? Math.floor((eligibleAmountNGN * percent) / 100)
      : fixedAmountNGN
  const discountNGN = Math.min(
    eligibleAmountNGN,
    coupon.maxDiscountNGN ?? eligibleAmountNGN,
    Math.max(0, rawDiscount)
  )

  if (discountNGN <= 0) return { ok: false, error: 'Coupon has no discount value' }

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      amountNGN: coupon.amountNGN,
      percent: coupon.percent,
      maxDiscountNGN: coupon.maxDiscountNGN ?? null,
    },
    discountNGN,
    finalAmountNGN: Math.max(0, eligibleAmountNGN - discountNGN),
  }
}

export async function lockCouponCodes(codes: string[], tx: Prisma.TransactionClient) {
  for (const code of [...new Set(codes)].sort()) {
    // Also change the row version: serializable Ride checkout must not see stale Tour holds.
    await tx.$queryRaw`UPDATE "Coupon" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "code" = ${code} RETURNING "id"`
  }
}

function normalizeIntegerMoney(value: unknown) {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null
  }

  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      return null
    }
    return Number(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const numeric = Number(trimmed)
    return Number.isFinite(numeric) ? Math.trunc(numeric) : null
  }

  if (typeof value === 'object') {
    const maybeNumber = value as { toNumber?: () => number; toString?: () => string }
    if (typeof maybeNumber.toNumber === 'function') {
      const numeric = maybeNumber.toNumber()
      return Number.isFinite(numeric) ? Math.trunc(numeric) : null
    }
    if (typeof maybeNumber.toString === 'function') {
      const numeric = Number(maybeNumber.toString())
      return Number.isFinite(numeric) ? Math.trunc(numeric) : null
    }
  }

  return null
}
