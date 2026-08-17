# Coupons Contract

Coupons are backend-authoritative and validated against the same pricing payload used for mobile quotes.

Implemented endpoint:

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `POST /api/mobile/v1/coupons/validate` | Customer bearer token + completed onboarding | Returns coupon and pricing preview, or a mobile error code. |

Request:

```json
{
  "routeId": "lagos-cotonou",
  "vehicleId": "saloon",
  "tripType": "one-way",
  "departureDate": "2026-08-20T09:00:00.000Z",
  "passengers": 2,
  "pickupArea": "mainland",
  "couponCode": "BENINFY10"
}
```

Success response:

```json
{
  "coupon": {
    "valid": true,
    "code": "BENINFY10",
    "description": "Partner discount",
    "discountType": "fixed",
    "calculatedDiscount": { "currency": "NGN", "value": 10000, "minorUnit": "kobo", "minorValue": 1000000, "formatted": "NGN 10,000" },
    "currency": "NGN"
  },
  "pricing": {}
}
```

Errors use `COUPON_INVALID` or `COUPON_EXPIRED`.

This endpoint calls the same quote/coupon validation path as mobile fare quotation. Booking creation still revalidates the coupon server-side and does not trust Flutter-provided discount values.
