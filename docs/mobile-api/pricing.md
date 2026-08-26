# Pricing Contract

Pricing is backend-authoritative and backed by Prisma `RoutePrice`, `Route`, `BorderFee`, `Vehicle`, and `FleetVehicle` records.

Implemented endpoints:

| Endpoint                               | Status      | Notes                                                                                                                                   |
| -------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/mobile/v1/pricing/quote`    | IMPLEMENTED | Returns server-calculated quote for route, date, passengers, backend-resolved pickup fare zone, vehicle/fleet choice. Requires completed customer onboarding. |
| `POST /api/mobile/v1/coupons/validate` | IMPLEMENTED | Validates coupon against the same server-side quote payload. Requires completed customer onboarding.                                    |

Final price precedence:

1. Fleet-vehicle route price for requested scope.
2. Fleet-vehicle default route price.
3. Vehicle/category route price for requested scope.
4. Vehicle/category default route price.
5. Explicit legacy static fallback only when `ALLOW_LEGACY_STATIC_PRICING_FALLBACK=true`.

Border fees come from `Route.borderFeeIds` and Prisma `BorderFee` records. They are per-passenger fees: the backend calculates `borderFeePerPassenger * passengers` and includes that total in the authoritative quote. Flutter must not multiply border fees locally.

Bidirectional corridors:

- Explicit reverse route records use their own `RoutePrice` and `borderFeeIds`.
- Generated reverse projections reuse the source corridor `pricingRouteId`.
- The backend, not Flutter, decides whether a selected route ID is explicit or generated.
- Lagos pickup-area pricing applies only when the actual selected route origin is Lagos.
- Flutter must not let the customer choose Mainland/Island. The backend resolves Lagos pickup fare zone from the selected pickup location metadata.

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

`pickupArea` is accepted only for backwards compatibility and is not authoritative. Quote calculation uses the backend-resolved `pickupFareZone.pricingScope`.

Route service-area validation runs before pickup-zone pricing and fare calculation. A quote is rejected if the pickup or destination location is outside the configured service area for the selected route endpoint, or if the country code conflicts.

Quote responses may include:

```json
{
  "pickupServiceArea": {
    "serviceArea": { "city": "Lagos", "countryCode": "NG" },
    "resolvedLocality": "Ikeja",
    "resolvedCountry": null,
    "resolvedCountryCode": "NG"
  },
  "destinationServiceArea": {
    "serviceArea": { "city": "Cotonou", "countryCode": "BJ" },
    "resolvedLocality": "Cotonou",
    "resolvedCountry": null,
    "resolvedCountryCode": "BJ"
  },
  "pickupFareZone": {
    "code": "lagos_mainland",
    "label": "Mainland",
    "pricingScope": "mainland"
  },
  "pricing": {
    "borderFee": {
      "perPassenger": {
        "currency": "NGN",
        "value": 5000,
        "minorUnit": "kobo",
        "minorValue": 500000,
        "formatted": "NGN 5,000"
      },
      "passengerCount": 2,
      "total": {
        "currency": "NGN",
        "value": 10000,
        "minorUnit": "kobo",
        "minorValue": 1000000,
        "formatted": "NGN 10,000"
      }
    }
  }
}
```

If `pickupFareZone` is `null`, Flutter should not show a Lagos fare-zone control. If it is present, Flutter may show it as read-only.

Mobile must treat the quote as display/pre-payment guidance. Booking creation and payment settlement still recheck price and fleet availability on the backend.

If passenger count changes, Flutter must request a fresh quote before booking/payment. The existing `pricing.borderFees` money field remains the total border fee for compatibility; prefer `pricing.borderFee` for the per-passenger breakdown.
