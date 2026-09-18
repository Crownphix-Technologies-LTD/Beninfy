import { prisma } from '@/lib/prisma'
import { lockCouponCodes, normalizeCouponCode, validateCouponCode } from '@/lib/coupons'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import { assertMobileLaunchCurrency } from '@/lib/mobile/paymentPolicy'
import { Prisma, type TourBooking } from '@prisma/client'

export function tourPricingDto(
  booking: Pick<
    TourBooking,
    'priceNGN' | 'subtotalNGN' | 'discountNGN' | 'couponSnapshot' | 'commercialSnapshot'
  >
) {
  const money = (value: number) => ({
    value,
    currency: 'NGN',
    minorUnit: 'kobo',
    minorValue: value * 100,
  })
  return {
    subtotal: money(booking.subtotalNGN ?? booking.priceNGN + booking.discountNGN),
    discount: money(booking.discountNGN),
    total: money(booking.priceNGN),
    coupon: booking.couponSnapshot,
    commercial: booking.commercialSnapshot,
  }
}

export async function setTourCoupon(
  input: { tourBookingId: string; principal: MobilePrincipal; code: string | null },
  client = prisma
) {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TourBooking" WHERE "id" = ${input.tourBookingId} FOR UPDATE`
    const booking = await tx.tourBooking.findFirst({
      where: { id: input.tourBookingId, userId: input.principal.userId },
      include: { couponUse: { include: { coupon: true } }, payments: { select: { status: true } } },
    })
    if (!booking) return { ok: false as const, code: 'TOUR_BOOKING_NOT_FOUND' as const }
    const currency = assertMobileLaunchCurrency(booking.currencyCode)
    if (!currency.ok) return { ok: false as const, code: currency.code }
    if (booking.quoteStatus === 'pending' || booking.status === 'quote_pending')
      return { ok: false as const, code: 'TOUR_QUOTE_REQUIRED' as const }
    if (booking.paymentStatus === 'paid' || booking.payments.some((p) => p.status === 'paid'))
      return { ok: false as const, code: 'PAYMENT_ALREADY_COMPLETED' as const }
    if (booking.status !== 'payment_pending')
      return { ok: false as const, code: 'TOUR_BOOKING_NOT_PAYABLE' as const }
    // A provider checkout cannot safely be repriced until its outcome is terminal.
    if (booking.payments.some((p) => p.status === 'pending' || p.status === 'amount_mismatch'))
      return { ok: false as const, code: 'TOUR_PRICING_LOCKED' as const }
    const code = input.code === null ? null : normalizeCouponCode(input.code)
    await lockCouponCodes(
      [code, booking.couponUse?.coupon.code].filter((v): v is string => Boolean(v)),
      tx
    )
    const subtotalNGN = booking.subtotalNGN ?? booking.priceNGN + booking.discountNGN
    const validation = code
      ? await validateCouponCode(code, subtotalNGN, tx, {
          product: 'tour',
          userId: input.principal.userId,
          excludeTourBookingId: booking.id,
        })
      : null
    if (validation && !validation.ok)
      return { ok: false as const, code: 'COUPON_INVALID' as const, message: validation.error }
    const applied = validation?.ok ? validation : null
    if (applied) {
      const data = {
        couponId: applied.coupon.id,
        userId: input.principal.userId,
        status: 'reserved',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        redeemedAt: null,
      }
      await tx.tourCouponUse.upsert({
        where: { tourBookingId: booking.id },
        create: { ...data, tourBookingId: booking.id },
        update: data,
      })
    } else if (booking.couponUse) {
      await tx.tourCouponUse.update({
        where: { tourBookingId: booking.id },
        data: { status: 'released' },
      })
    }
    const updated = await tx.tourBooking.update({
      where: { id: booking.id },
      data: {
        subtotalNGN,
        paymentStatus: 'pending',
        discountNGN: applied?.discountNGN ?? 0,
        priceNGN: applied?.finalAmountNGN ?? subtotalNGN,
        couponSnapshot: applied
          ? { ...applied.coupon, discountNGN: applied.discountNGN }
          : Prisma.DbNull,
      },
    })
    return { ok: true as const, pricing: tourPricingDto(updated) }
  })
}

export async function freezeTourCoupon(booking: TourBooking, tx: Prisma.TransactionClient) {
  const use = await tx.tourCouponUse.findUnique({
    where: { tourBookingId: booking.id },
    include: { coupon: true },
  })
  if (!booking.couponSnapshot) return { ok: true as const }
  if (!use || use.status === 'released')
    return { ok: false as const, code: 'COUPON_INVALID' as const }
  await lockCouponCodes([use.coupon.code], tx)
  const result = await validateCouponCode(
    use.coupon.code,
    booking.subtotalNGN ?? booking.priceNGN + booking.discountNGN,
    tx,
    { product: 'tour', userId: booking.userId, excludeTourBookingId: booking.id }
  )
  if (!result.ok || result.discountNGN !== booking.discountNGN)
    return { ok: false as const, code: 'COUPON_INVALID' as const }
  await tx.tourCouponUse.update({ where: { id: use.id }, data: { expiresAt: null } })
  return { ok: true as const }
}

export async function redeemTourCoupon(tourBookingId: string, tx: Prisma.TransactionClient) {
  const use = await tx.tourCouponUse.findUnique({
    where: { tourBookingId },
    include: { coupon: true },
  })
  if (!use || use.status === 'redeemed') return
  if (use.status !== 'reserved' || use.expiresAt !== null)
    throw new Error('Tour coupon was not reserved for settlement')
  await lockCouponCodes([use.coupon.code], tx)
  const redeemed = await tx.tourCouponUse.updateMany({
    where: { id: use.id, status: 'reserved' },
    data: { status: 'redeemed', redeemedAt: new Date() },
  })
  if (redeemed.count)
    await tx.coupon.update({
      where: { id: use.couponId },
      data: { redeemedCount: { increment: 1 } },
    })
}

export async function expireFailedTourCoupon(tourBookingId: string, client = prisma) {
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TourBooking" WHERE "id" = ${tourBookingId} FOR UPDATE`
    if (
      await tx.payment.count({
        where: { tourBookingId, status: { in: ['pending', 'paid', 'amount_mismatch'] } },
      })
    )
      return
    const use = await tx.tourCouponUse.findUnique({
      where: { tourBookingId },
      include: { coupon: true },
    })
    if (!use || use.status !== 'reserved') return
    await lockCouponCodes([use.coupon.code], tx)
    await tx.tourCouponUse.update({
      where: { id: use.id },
      data: { expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    })
  })
}
