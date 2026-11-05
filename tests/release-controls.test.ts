import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { rideCouponBookingFrozen } from '../src/lib/releaseControls'

test('Ride coupon booking freeze is explicit and fail-closed only for true', () => {
  const previous = process.env.RIDE_COUPON_BOOKING_FREEZE
  try {
    for (const value of [undefined, '', 'false', '1', 'yes']) {
      if (value === undefined) delete process.env.RIDE_COUPON_BOOKING_FREEZE
      else process.env.RIDE_COUPON_BOOKING_FREEZE = value
      assert.equal(rideCouponBookingFrozen(), false)
    }
    process.env.RIDE_COUPON_BOOKING_FREEZE = ' TRUE '
    assert.equal(rideCouponBookingFrozen(), true)
  } finally {
    if (previous === undefined) delete process.env.RIDE_COUPON_BOOKING_FREEZE
    else process.env.RIDE_COUPON_BOOKING_FREEZE = previous
  }
})

test('Ride creation gate is coupon-only and precedes booking database writes', () => {
  const route = readFileSync('src/app/api/bookings/route.ts', 'utf8')
  const gate = route.indexOf('data.couponCode?.trim() && rideCouponBookingFrozen()')
  assert.ok(gate > -1)
  assert.ok(gate < route.indexOf('prisma.user.findUnique'))
  assert.ok(gate < route.indexOf('prisma.vehicle.findUnique'))
  assert.ok(gate < route.indexOf('prisma.$transaction'))
  assert.match(route, /code: 'COUPON_BOOKING_MAINTENANCE'/)
  assert.match(route, /status: 503, headers: \{ 'Retry-After': '300' \}/)
})

test('payment settlement paths remain independent from the Ride coupon freeze', () => {
  for (const file of [
    'src/app/api/payments/webhook/route.ts',
    'src/app/api/payments/verify/route.ts',
    'src/app/api/workers/payments/reconcile/route.ts',
    'src/lib/paymentSettlement.ts',
  ]) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /RIDE_COUPON_BOOKING_FREEZE/)
    assert.doesNotMatch(readFileSync(file, 'utf8'), /rideCouponBookingFrozen/)
  }
})
