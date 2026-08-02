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

  const coupon = await client.coupon.findUnique({ where: { code } })
  if (!coupon) return { ok: false, error: 'Coupon code was not found' }
  if (!coupon.active) return { ok: false, error: 'Coupon code is inactive' }

  const now = new Date()
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, error: 'Coupon code is not active yet' }
  if (coupon.expiresAt && coupon.expiresAt < now) return { ok: false, error: 'Coupon code has expired' }
  if (coupon.minSpendNGN && amountNGN < coupon.minSpendNGN) {
    return { ok: false, error: `Coupon requires a minimum spend of NGN ${coupon.minSpendNGN.toLocaleString()}` }
  }
  if (coupon.maxRedemptions && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { ok: false, error: 'Coupon code has reached its usage limit' }
  }

  const rawDiscount =
    coupon.discountType === 'percent'
      ? Math.floor((amountNGN * (coupon.percent ?? 0)) / 100)
      : (coupon.amountNGN ?? 0)
  const discountNGN = Math.min(amountNGN, Math.max(0, rawDiscount))

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
    finalAmountNGN: Math.max(0, amountNGN - discountNGN),
  }
}
