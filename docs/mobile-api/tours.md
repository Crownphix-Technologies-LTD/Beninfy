# Tours

Implemented endpoints:

- `GET /api/mobile/v1/tours`
- `GET /api/mobile/v1/tours/:tourId`

These expose the existing public tour catalogue to Flutter. Each Tour now also includes
template-execution readiness metadata:

```json
{
  "executionReady": false,
  "executionReadinessReason": "no_itinerary_days",
  "itineraryDays": []
}
```

`executionReady` is server-derived. Flutter must not decide that a Tour is executable
from catalogue fields alone.

Readiness reasons:

- `ready`
- `no_itinerary_days`
- `missing_day_stop`
- `missing_stop_coordinates`

Admin itinerary configuration is available at:

- `GET /api/admin/tours/:id/itinerary`
- `PUT /api/admin/tours/:id/itinerary`

The `PUT` contract replaces the reusable itinerary template atomically:

```json
{
  "days": [
    {
      "dayNumber": 1,
      "title": "Arrival and Ouidah",
      "titleFr": "Arrivée et Ouidah",
      "description": "Day plan",
      "descriptionFr": "Programme du jour",
      "defaultStartLabel": "Hotel pickup",
      "defaultStartAddress": "Cotonou hotel",
      "defaultStartLatitude": 6.3703,
      "defaultStartLongitude": 2.3912,
      "defaultEndLabel": "Hotel dropoff",
      "defaultEndAddress": "Cotonou hotel",
      "defaultEndLatitude": 6.3703,
      "defaultEndLongitude": 2.3912,
      "stops": [
        {
          "sortOrder": 1,
          "title": "Ouidah Museum",
          "titleFr": "Musée d'Ouidah",
          "address": "Ouidah, Benin",
          "latitude": 6.3667,
          "longitude": 2.0833,
          "estimatedDurationMinutes": 90,
          "required": true
        }
      ]
    }
  ]
}
```

Tour booking, Tour payment, Driver Tour execution, Customer live Tour tracking,
Tour journey intelligence, Tour chat, and Backoffice live Tour monitoring are not
implemented in this phase. Existing Tours without structured itinerary remain
catalogue-visible but are not execution-ready.
