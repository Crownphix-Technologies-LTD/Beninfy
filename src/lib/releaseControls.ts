export function rideCouponBookingFrozen() {
  return process.env.RIDE_COUPON_BOOKING_FREEZE?.trim().toLowerCase() === 'true'
}
