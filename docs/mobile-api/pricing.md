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

Implemented endpoints:

| Endpoint | Status | Notes |
| --- | --- | --- |
| `POST /api/mobile/v1/pricing/quote` | IMPLEMENTED | Returns server-calculated quote for route, date, passengers, pickup area, vehicle/fleet choice. Requires completed customer onboarding. |
| `POST /api/mobile/v1/coupons/validate` | IMPLEMENTED | Validates coupon against the same server-side quote payload. Requires completed customer onboarding. |

Admin pricing modification remains admin-only through existing backoffice routes.

Important implementation note: current `RoutePrice.vehicleId` can represent either a vehicle category or a fleet vehicle depending on `pricingScope`. Mobile clients should never interpret this internal storage detail directly.

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

`routeId` is preferred. `from` and `to` are also accepted for compatibility with the web booking shape.

Quote success response:

```json
{
  "quote": {
    "route": {},
    "vehicle": {},
    "fleetVehicle": null,
    "tripType": "one-way",
    "departureDate": "2026-08-20T09:00:00.000Z",
    "returnDate": null,
    "passengers": 2,
    "pickupArea": "mainland",
    "currency": "NGN",
    "pricing": {
      "oneWayDropoffFare": { "currency": "NGN", "value": 180000, "minorUnit": "kobo", "minorValue": 18000000, "formatted": "NGN 180,000" },
      "legCount": 1,
      "rideFare": {},
      "borderFees": {},
      "subtotal": {},
      "discount": {},
      "total": {}
    },
    "coupon": null,
    "availability": {},
    "informationalOnly": true
  }
}
```

Mobile must treat this quote as display/pre-payment guidance. Booking creation still recalculates fare, coupon discount, and availability on the backend.
