# Pricing Architecture

Pricing is database-authoritative for production booking and mobile quote flows.

## Precedence

For a route, vehicle category, optional fleet unit, and pickup scope:

1. Fleet-vehicle `RoutePrice` for the requested scope.
2. Fleet-vehicle `RoutePrice` with `default` scope.
3. Vehicle/category `RoutePrice` for the requested scope.
4. Vehicle/category `RoutePrice` with `default` scope.
5. Legacy static fallback only when `ALLOW_LEGACY_STATIC_PRICING_FALLBACK=true`.

The fallback is explicit, logs a warning, and should not be enabled for normal production operation.

## Pickup-Area Pricing

Lagos mainland/island is still code-level policy through `requiresLagosPickupArea`. The actual amounts should be represented as scoped `RoutePrice` rows:

- `pricingScope=mainland`
- `pricingScope=island`

This preserves the existing business rule without introducing a new pickup-zone table in this phase.

## Border Fees

Routes reference border fees through `Route.borderFeeIds`.

Fee calculation:

- one-way: sum `BorderFee.feePerPersonNGN` for the route's `borderFeeIds`;
- round-trip: sum `BorderFee.feeRoundTripNGN` for the route's `borderFeeIds`;
- if a referenced fee is missing, quote/booking returns configuration failure instead of silently charging stale data.

## Shared Fare Core

`src/lib/bookingPricing.ts` owns fare calculation for:

- mobile quote;
- mobile booking adapter through web booking creation;
- web booking creation;
- server-rendered payment confirmation fallback.

The booking write path recalculates price, coupon discount, border fee, and availability on the backend.
