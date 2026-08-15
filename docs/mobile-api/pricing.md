# Pricing Contract

Pricing is backend-authoritative.

Current pricing inputs include:

- Route
- Vehicle category
- Optional fleet unit override
- Pickup area such as Lagos mainland/island
- Trip type
- Border fees
- Coupon validation

Mobile apps may display estimates returned by the backend, but must not calculate final authoritative fares locally.

Planned endpoints:

| Endpoint | Status | Notes |
| --- | --- | --- |
| `POST /api/mobile/v1/pricing/quote` | PLANNED | Returns server-calculated quote for route, date, passengers, pickup area, vehicle/fleet choice. |
| `POST /api/mobile/v1/coupons/validate` | PLANNED | Validates coupon against a server-side quote or booking. |

Admin pricing modification remains admin-only through existing backoffice routes.

Important implementation note: current `RoutePrice.vehicleId` can represent either a vehicle category or a fleet vehicle depending on `pricingScope`. Mobile clients should never interpret this internal storage detail directly.
