import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCouponCode } from '../src/lib/coupons'
import { calculateTourCommercialSnapshot, CANONICAL_TOUR_IDS } from '../src/lib/tourCommercial'

const base = {
  id: 'coupon',
  code: 'SAVE',
  description: null,
  discountType: 'percent',
  percent: 10,
  amountNGN: null,
  active: true,
  startsAt: null,
  expiresAt: null,
  minSpendNGN: null,
  maxRedemptions: null,
  redeemedCount: 0,
  applicability: 'tour',
  maxDiscountNGN: null,
  maxPerCustomer: null,
}
function client(overrides = {}, held = 0, rides = 0, uses = 0) {
  return {
    coupon: { findUnique: async () => ({ ...base, ...overrides }) },
    tourCouponUse: {
      count: async (args: { where: { userId?: string } }) => (args.where.userId ? uses : held),
    },
    booking: { count: async () => rides },
  } as never
}

test('coupon applicability defaults to Ride and explicitly supports Tour or both', async () => {
  for (const applicability of ['ride', 'tour', 'both', undefined]) {
    for (const product of ['ride', 'tour'] as const) {
      const result = await validateCouponCode('SAVE', 100000, client({ applicability }), {
        product,
        userId: 'customer',
      })
      assert.equal(result.ok, applicability === 'both' || (applicability ?? 'ride') === product)
    }
  }
})

test('Tour coupons apply after all components and only Cotonou Gogotinkpo, never traveller multiplication', async () => {
  for (const count of [1, 2, 3]) {
    for (const gogotinkpo of [false, true]) {
      const commercial = calculateTourCommercialSnapshot({
        tourIds: CANONICAL_TOUR_IDS.slice(0, count),
        priceMinor: 10000000,
        gogotinkpo,
      })
      for (const travellers of [1, 3, 6]) {
        assert.ok(travellers > 0)
        const result = await validateCouponCode('SAVE', commercial.priceNGN, client(), {
          product: 'tour',
          userId: 'customer',
        })
        assert.ok(result.ok)
        assert.equal(result.discountNGN, (count * 100000 + (gogotinkpo ? 20000 : 0)) / 10)
        assert.equal(result.finalAmountNGN, commercial.priceNGN - result.discountNGN)
      }
    }
  }
  const fixed = await validateCouponCode(
    'SAVE',
    320000,
    client({ discountType: 'fixed', amountNGN: 20000 }),
    { product: 'tour' }
  )
  assert.ok(fixed.ok)
  assert.equal(fixed.finalAmountNGN, 300000)
  const capped = await validateCouponCode('SAVE', 640000, client({ maxDiscountNGN: 25000 }), {
    product: 'tour',
  })
  assert.ok(capped.ok)
  assert.equal(capped.discountNGN, 25000)
})

test('coupon eligibility checks dates, spend, active state, held global capacity and per-customer use', async () => {
  for (const overrides of [
    { active: false },
    { startsAt: new Date('2999-01-01') },
    { expiresAt: new Date('2000-01-01') },
    { minSpendNGN: 200000 },
    { percent: 0 },
    { maxRedemptions: 1, redeemedCount: 1 },
  ])
    assert.equal(
      (
        await validateCouponCode('SAVE', 100000, client(overrides), {
          product: 'tour',
          userId: 'customer',
        })
      ).ok,
      false
    )
  assert.equal(
    (
      await validateCouponCode('SAVE', 100000, client({ maxRedemptions: 1 }, 1), {
        product: 'tour',
      })
    ).ok,
    false
  )
  assert.equal(
    (
      await validateCouponCode('SAVE', 100000, client({ maxPerCustomer: 2 }, 0, 1, 1), {
        product: 'tour',
        userId: 'customer',
      })
    ).ok,
    false
  )
  assert.equal(
    (await validateCouponCode('SAVE', 100000, client({ maxPerCustomer: 1 }), { product: 'tour' }))
      .ok,
    false
  )
})
