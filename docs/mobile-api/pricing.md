# Pricing Contract

Pricing is backend-authoritative and backed by Prisma `RoutePrice`, `Route`, `BorderFee`, `Vehicle`, and `FleetVehicle` records.

Implemented endpoints:

| Endpoint | Status | Notes |
| --- | --- | --- |
| `POST /api/mobile/v1/pricing/quote` | IMPLEMENTED | Returns server-calculated quote for route, date, passengers, pickup area, vehicle/fleet choice. Requires completed customer onboarding. |
| `POST /api/mobile/v1/coupons/validate` | IMPLEMENTED | Validates coupon against the same server-side quote payload. Requires completed customer onboarding. |

Final price precedence:

1. Fleet-vehicle route price for requested scope.
2. Fleet-vehicle default route price.
3. Vehicle/category route price for requested scope.
4. Vehicle/category default route price.
5. Explicit legacy static fallback only when `ALLOW_LEGACY_STATIC_PRICING_FALLBACK=true`.

Border fees come from `Route.borderFeeIds` and Prisma `BorderFee` records.

Quote request JSON:

```json
{
  "routeId": "lagos-cotonou",
  "vehicleId": "saloon",
  "fleetVehicleId": "optional-fleet-unit-id",
  "tripType": "one-way",
  "departureDate": "2026-08-20T09:00:00.000Z",
  "returnDate": null,
  "passengers": 2,
  "pickupArea": "mainland",
  "couponCode": "OPTIONAL"
}
```

`routeId` is preferred. `from` and `to` are accepted for compatibility with the web booking shape.

Mobile must treat the quote as display/pre-payment guidance. Booking creation and payment settlement still recheck price and fleet availability on the backend.
