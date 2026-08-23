# Pricing Contract

Pricing is backend-authoritative and backed by Prisma `RoutePrice`, `Route`, `BorderFee`, `Vehicle`, and `FleetVehicle` records.

Implemented endpoints:

| Endpoint                               | Status      | Notes                                                                                                                                   |
| -------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/mobile/v1/pricing/quote`    | IMPLEMENTED | Returns server-calculated quote for route, date, passengers, pickup area, vehicle/fleet choice. Requires completed customer onboarding. |
| `POST /api/mobile/v1/coupons/validate` | IMPLEMENTED | Validates coupon against the same server-side quote payload. Requires completed customer onboarding.                                    |

Final price precedence:

1. Fleet-vehicle route price for requested scope.
2. Fleet-vehicle default route price.
3. Vehicle/category route price for requested scope.
4. Vehicle/category default route price.
5. Explicit legacy static fallback only when `ALLOW_LEGACY_STATIC_PRICING_FALLBACK=true`.

Border fees come from `Route.borderFeeIds` and Prisma `BorderFee` records.

Bidirectional corridors:

- Explicit reverse route records use their own `RoutePrice` and `borderFeeIds`.
- Generated reverse projections reuse the source corridor `pricingRouteId`.
- The backend, not Flutter, decides whether a selected route ID is explicit or generated.
- Lagos pickup-area pricing applies only when the actual selected route origin is Lagos.

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
  "pickupCity": "Lagos",
  "pickupCountryCode": "NG",
  "destinationCity": "Cotonou",
  "destinationCountryCode": "BJ",
  "pickupArea": "mainland",
  "couponCode": "OPTIONAL"
}
```

`routeId` is preferred. `from` and `to` are accepted for compatibility with the web booking shape.

Route city boundary validation runs before pickup-area pricing and fare calculation. A quote is rejected if the normalized pickup city does not match the route origin or the normalized destination city does not match the route destination.

Mobile must treat the quote as display/pre-payment guidance. Booking creation and payment settlement still recheck price and fleet availability on the backend.
