# Availability Contract

Availability is informational. It does not reserve a vehicle.

Implemented endpoint:

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `POST /api/mobile/v1/availability` | Customer bearer token + completed onboarding | Checks category or selected fleet unit availability for one-way or round-trip dates. |

Request:

```json
{
  "routeId": "lagos-cotonou",
  "vehicleId": "saloon",
  "fleetVehicleId": null,
  "tripType": "round-trip",
  "departureDate": "2026-08-20T09:00:00.000Z",
  "returnDate": "2026-08-22T09:00:00.000Z",
  "passengers": 2
}
```

Success response:

```json
{
  "route": {},
  "vehicle": {},
  "fleetVehicle": null,
  "tripType": "round-trip",
  "departureDate": "2026-08-20T09:00:00.000Z",
  "returnDate": "2026-08-22T09:00:00.000Z",
  "passengers": 2,
  "availability": {
    "status": "available",
    "available": true,
    "availableCount": 2,
    "physicalFleetCount": 3,
    "dates": [
      {
        "date": "2026-08-20T09:00:00.000Z",
        "physicalFleetCount": 3,
        "availableCount": 2,
        "available": true
      }
    ]
  },
  "informationalOnly": true
}
```

Booking creation recalculates availability inside the authoritative reservation transaction.
