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
  client: PrismaClientLike = prisma
): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(rawCode)
  if (!code) return { ok: false, error: 'Enter a coupon code' }
  const eligibleAmountNGN = normalizeIntegerMoney(amountNGN) ?? 0

  const coupon = await client.coupon.findUnique({ where: { code } })
  if (!coupon) return { ok: false, error: 'Coupon code was not found' }
  if (!coupon.active) return { ok: false, error: 'Coupon code is inactive' }

  const now = new Date()
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, error: 'Coupon code is not active yet' }
  if (coupon.expiresAt && coupon.expiresAt < now) return { ok: false, error: 'Coupon code has expired' }
  const minSpendNGN = normalizeIntegerMoney(coupon.minSpendNGN)
  if (minSpendNGN && eligibleAmountNGN < minSpendNGN) {
    return { ok: false, error: `Coupon requires a minimum spend of NGN ${minSpendNGN.toLocaleString()}` }
  }
  const maxRedemptions = normalizeIntegerMoney(coupon.maxRedemptions)
  const redeemedCount = normalizeIntegerMoney(coupon.redeemedCount) ?? 0
  if (maxRedemptions && redeemedCount >= maxRedemptions) {
    return { ok: false, error: 'Coupon code has reached its usage limit' }
  }

  const percent = normalizeIntegerMoney(coupon.percent) ?? 0
  const fixedAmountNGN = normalizeIntegerMoney(coupon.amountNGN) ?? 0
  const rawDiscount =
    coupon.discountType === 'percent'
      ? Math.floor((eligibleAmountNGN * percent) / 100)
      : fixedAmountNGN
  const discountNGN = Math.min(eligibleAmountNGN, Math.max(0, rawDiscount))

  if (discountNGN <= 0) return { ok: false, error: 'Coupon has no discount value' }

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
    },
    discountNGN,
    finalAmountNGN: Math.max(0, eligibleAmountNGN - discountNGN),
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
