# Tour coupons

Tour coupons extend the existing Coupon engine. `applicability` is `ride`, `tour`, or `both`; the database default and migration preserve existing Ride-only behavior. Existing Ride redemption timing stays booking creation. Optional `maxDiscountNGN` caps the computed discount, and `maxPerCustomer` counts both Ride bookings and active/resolved Tour uses of that coupon. CRUD, permissions and audit remain in Backoffice Coupons.

## Customer endpoints

Both endpoints require Customer bearer authentication, completed onboarding and an owned TourBooking. Limit: 20 mutations per Customer per 15 minutes. No Customer-supplied price, amount, user ID or financial state is accepted.

- `POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/coupon`: exact body `{ "code": "WELCOME20" }`. Also replaces a coupon.
- `DELETE /api/mobile/v1/customer/tour-bookings/:tourBookingId/coupon`: no body. Removes the coupon.

Success: HTTP 200. Exact example for Sedan, all three Tours and Gogotinkpo, with a 10% coupon:

```json
{
  "pricing": {
    "subtotal": { "value": 320000, "currency": "NGN", "minorUnit": "kobo", "minorValue": 32000000 },
    "discount": { "value": 32000, "currency": "NGN", "minorUnit": "kobo", "minorValue": 3200000 },
    "total": { "value": 288000, "currency": "NGN", "minorUnit": "kobo", "minorValue": 28800000 },
    "coupon": {
      "id": "coupon-id", "code": "WELCOME20", "description": null,
      "discountType": "percent", "amountNGN": null, "percent": 10,
      "maxDiscountNGN": null, "discountNGN": 32000
    },
    "commercial": {
      "version": 1, "currency": "NGN", "pricingBasis": "vehicle_per_selected_tour",
      "components": [
        { "tourId": "cotonou-city-tour", "basePriceMinor": 10000000, "addonMinor": 2000000, "totalMinor": 12000000, "gogotinkpo": true, "transportationOnly": false },
        { "tourId": "ouidah-tour", "basePriceMinor": 10000000, "addonMinor": 0, "totalMinor": 10000000, "gogotinkpo": false, "transportationOnly": false },
        { "tourId": "ganvie-tour", "basePriceMinor": 10000000, "addonMinor": 0, "totalMinor": 10000000, "gogotinkpo": false, "transportationOnly": true }
      ],
      "totalMinor": 32000000, "priceNGN": 320000,
      "vehicleCategoryId": "sedan-category-id", "pricingCategory": "sedan", "quoteRequired": false
    }
  }
}
```

`commercial` is the existing `TourBooking.commercial` JSON object (or null for legacy bookings). On removal `coupon` is null, discount is zero, and total equals the original subtotal. Detail/list DTOs add `tourBooking.pricing` with `subtotal`, `discount`, `total`, and `coupon`. Payment DTOs expose `couponsSupported: true` and `pricing`, including the unchanged `commercial` snapshot.

Errors use `{ "error": { "code": "...", "message": "..." } }`:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Invalid/extra request fields |
| 400 | COUPON_INVALID | Missing, inactive, expired, not-yet-valid, wrong scope, minimum/limit failure, or changed discount before initialization |
| 400 | UNSUPPORTED_PAYMENT_CURRENCY | Mobile launch remains NGN only |
| 401 | UNAUTHENTICATED | No valid Customer session |
| 403 | FORBIDDEN / ONBOARDING_INCOMPLETE | Wrong role / incomplete onboarding |
| 404 | TOUR_BOOKING_NOT_FOUND | Absent or unowned booking |
| 409 | TOUR_QUOTE_REQUIRED | Custom quote not yet approved |
| 409 | TOUR_BOOKING_NOT_PAYABLE | Booking is not payment-pending |
| 409 | TOUR_PRICING_LOCKED | Pending/unresolved checkout; reconcile/verify it before editing price |
| 409 | PAYMENT_ALREADY_COMPLETED | Paid financial snapshot is immutable |
| 429 | RATE_LIMITED | Mutation limit exceeded |

## Financial rules

Selected Tour vehicle prices + Cotonou-only Gogotinkpo = subtotal; then coupon discount = final total. Travellers never multiply that basis. Operations-approved custom quote becomes subtotal; quote-pending requests cannot apply coupons. Component/day prices and the approved quote are not rewritten by coupons.

`TourBooking.subtotalNGN`, `discountNGN`, `couponSnapshot` and `priceNGN` persist the financial state. Every external payment stores `Payment.tourPricingSnapshot`, including commercial components/add-ons and exact coupon rule/amount. Payment initializes from that frozen amount; existing verification still checks provider amount/currency/reference, and settlement checks booking amount. Editing/deactivating a coupon after checkout does not rewrite paid snapshots.

`TourCouponUse` reserves capacity at apply (30 minutes), and holds it without expiry at initialization until a definitive payment outcome. Unknown or merely expired pending provider checkout is not sufficient to release capacity or change price. Failed initialization/definitive failure returns the hold to a 30-minute retry window, provided no pending/paid/mismatch payment exists. Reapplying after a draft hold expires revalidates capacity and rules. Operations should reconcile unresolved provider payments rather than bypassing their financial lock.

Shared Coupon row locks serialize Tour reservations and Ride consumption. Locks change the row version so serializable Ride transactions reject stale concurrent capacity. Per-customer capacity includes active Tour holds. Booking locks serialize coupon mutations, initialization and settlement. Successful settlement consumes once and increments the existing counter; duplicate callbacks/webhooks do not increment again. Zero-payable coupon bookings confirm/redeem transactionally without an external charge.

## Migration and tests

`20260918140000_tour_coupons` is additive. Existing bookings get their original price as subtotal; existing Coupon rows remain Ride-only. Validate on disposable PostgreSQL; never reset a live schema. `tests/tour-coupons.test.ts` and `tests/tour-coupons-database.test.ts` cover authority, scope, limits, pricing, custom gate, replacement/removal, ownership, checkout freezing and concurrent/idempotent settlement.
