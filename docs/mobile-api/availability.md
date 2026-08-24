# Availability Contract

Availability is informational. It does not reserve a vehicle.

Implemented endpoint:

| Endpoint                           | Auth                                         | Notes                                                                                |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /api/mobile/v1/availability` | Customer bearer token + completed onboarding | Checks category or selected fleet unit availability for one-way or round-trip dates. |

The response now includes customer-safe selectable fleet units when the customer has selected a category and physical units pass the same constraints used by booking/payment settlement.

Request payloads must include normalized pickup and destination location fields from backend Place Details, Saved Places, or backend reverse geocoding:

```json
{
  "routeId": "cotonou-togo",
  "vehicleId": "saloon",
  "tripType": "one-way",
  "departureDate": "2026-08-20T09:00:00.000Z",
  "passengers": 2,
  "pickupCity": "Cotonou",
  "pickupCountryCode": "BJ",
  "destinationCity": "Lomé",
  "destinationCountryCode": "TG"
}
```

The backend rejects mismatched or unresolved location cities before checking fleet availability.

Customer-safe fleet unit fields:

- id
- vehicleId
- displayName
- color
- currentCity
- status

Do not expose plate numbers, admin notes, maintenance notes, driver assignment, or internal status history pre-booking.

Success response:

```json
{
  "availability": {
    "status": "available",
    "available": true,
    "availableCount": 2,
    "physicalFleetCount": 3,
    "selectableFleetUnits": [
      {
        "id": "fleet_unit_id",
        "vehicleId": "suv",
        "displayName": "RAV4",
        "color": "Black",
        "currentCity": "Lagos",
        "status": "available"
      }
    ],
    "informationalOnly": true,
    "dates": []
  }
}
```

Booking creation recalculates availability inside the authoritative reservation transaction.
