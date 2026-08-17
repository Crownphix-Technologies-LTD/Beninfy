# Travel Preferences

Travel preferences are customer defaults only. They do not override route pricing, vehicle availability, passenger-capacity rules, or booking validation.

Implemented endpoints:

- `GET /api/mobile/v1/customer/travel-preferences`
- `PATCH /api/mobile/v1/customer/travel-preferences`

All endpoints require a customer bearer token and completed onboarding.

Request shape:

```json
{
  "preferredVehicleId": "sienna",
  "defaultPassengers": 4,
  "defaultPickupInstructions": "Call before arriving at the gate."
}
```

`preferredVehicleId` must reference an available vehicle category when supplied. `defaultPassengers` is constrained to `1..50`.
