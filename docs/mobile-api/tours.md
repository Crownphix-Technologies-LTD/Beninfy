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

Customer Tour booking foundation is available at:

- `POST /api/mobile/v1/customer/tours/:tourId/book`
- `GET /api/mobile/v1/customer/tour-bookings`
- `GET /api/mobile/v1/customer/tour-bookings/:tourBookingId`
- `GET /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment`
- `POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment`

All customer Tour booking endpoints require a customer mobile session with completed onboarding.

Create request:

```json
{
  "startDate": "2026-10-15",
  "travellers": 2,
  "idempotencyKey": "customer-generated-request-id"
}
```

`idempotencyKey` is optional but recommended for mobile double-tap protection. It must be 8 to 120 characters using letters, numbers, `.`, `_`, `:`, or `-`. Reusing the same key for the same authenticated customer returns the existing Tour booking with HTTP `200`; a fresh create returns HTTP `201`.

Create success response:

```json
{
  "tourBooking": {
    "id": "tour_booking_id",
    "reference": "BFYT-0123ABCD45",
    "tourId": "ganvie-day-tour",
    "status": "payment_pending",
    "startDate": "2026-10-15T00:00:00.000Z",
    "endDate": "2026-10-15T00:00:00.000Z",
    "travellers": 2,
    "price": {
      "value": 120000,
      "currency": "NGN",
      "minorUnit": "kobo",
      "minorValue": 12000000
    },
    "payment": {
      "status": "pending",
      "amount": {
        "value": 120000,
        "currency": "NGN",
        "minorUnit": "kobo",
        "minorValue": 12000000
      },
      "amountPaidNGN": 0,
      "provider": null,
      "paymentReference": null,
      "canInitialize": true
    },
    "tour": {
      "id": "ganvie-day-tour",
      "title": "Ganvie Day Tour",
      "titleFr": null,
      "destination": "Ganvie",
      "destinationFr": null,
      "country": "Benin Republic",
      "countryFr": null,
      "image": "/images/tours/ganvie.jpg"
    },
    "progress": {
      "currentDay": 1,
      "totalDays": 1
    },
    "days": []
  },
  "pricingBasis": "tour.startingFromNGN"
}
```

The `days` array contains booked day snapshots with `dayNumber`, `totalDays`, `label`, pickup/end coordinates where configured, assignment IDs when later assigned, timestamps, and ordered stop snapshots. Snapshot rows are authoritative for the booking and do not change automatically if the catalogue itinerary is edited later.

Errors:

- `TOUR_NOT_FOUND` when the catalogue Tour does not exist.
- `TOUR_NOT_EXECUTION_READY` when the Tour has no complete structured itinerary.
- `TOUR_BOOKING_DATE_INVALID` when `startDate` is not a future/current `YYYY-MM-DD` UTC calendar date.
- `TOUR_TRAVELLER_COUNT_INVALID` when `travellers` is outside the launch range of 1 to 30.
- `TOUR_BOOKING_NOT_FOUND` when a customer requests another customer's Tour booking or an unknown ID.
- `TOUR_BOOKING_NOT_PAYABLE` when Flutter attempts Tour payment initialization before Tour payment ownership is implemented.

Phase 2 limitations:

- Tour payment initialization is not implemented yet.
- Tour coupons are not supported yet because the current coupon model is ride-booking-owned.
- Customer Tour cancellation/refund is not implemented yet.
- Driver Tour execution, Customer live Tour tracking, Tour journey intelligence, and Tour chat are not implemented yet.

Backoffice read-only visibility:

- `GET /api/admin/tour-bookings`
- `GET /api/admin/tour-bookings/:id`
- `/:locale/admin/tour-bookings`

Admin access requires the existing `tours` permission.

## Driver Tour Execution

Implemented endpoints:

- `GET /api/mobile/v1/driver/tours`
- `GET /api/mobile/v1/driver/tours/:tourBookingDayId`
- `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions`

Driver Tour work is day-scoped. A multi-day Tour can have different Drivers and fleet vehicles per day.

Driver list response:

```json
{
  "view": "all",
  "tours": []
}
```

Driver detail/action response:

```json
{
  "tour": {
    "tourBookingId": "tour_booking_id",
    "tourBookingDayId": "tour_booking_day_id",
    "reference": "BFYT-0123ABCD45",
    "tour": {
      "title": "Ganvie Day Tour",
      "titleFr": null,
      "destination": "Ganvie",
      "destinationFr": null,
      "country": "Benin Republic",
      "countryFr": null,
      "image": "/images/tours/ganvie.jpg"
    },
    "customer": {
      "id": "customer_id",
      "name": "Customer Name",
      "email": "customer@example.com",
      "phone": "+22951019134"
    },
    "group": {
      "travellerCount": 2,
      "passengerSummary": "2 travellers"
    },
    "payment": {
      "status": "paid",
      "executionAllowed": true
    },
    "day": {
      "id": "tour_booking_day_id",
      "dayNumber": 1,
      "totalDays": 3,
      "label": "Day 1 of 3",
      "scheduledDate": "2026-10-15T00:00:00.000Z",
      "status": "assigned",
      "title": "Arrival and Ouidah",
      "pickup": {
        "label": "Hotel pickup",
        "address": "Cotonou hotel",
        "coordinates": { "latitude": 6.3703, "longitude": 2.3912 }
      }
    },
    "vehicle": {
      "id": "fleet_vehicle_id",
      "label": "Toyota Sienna",
      "plateNumber": "ABC-123",
      "color": "Black",
      "status": "available",
      "currentCity": "Cotonou"
    },
    "stops": [],
    "currentStop": null,
    "nextStop": null,
    "progress": {
      "completedStopCount": 0,
      "totalStopCount": 4,
      "currentStopNumber": null
    },
    "allowedActions": ["accept", "decline"]
  }
}
```

Action request:

```json
{
  "action": "accept",
  "stopId": "required-for-arrive_stop-and-complete_stop"
}
```

Day lifecycle:

```text
upcoming -> assigned -> driver_en_route -> driver_arrived -> in_progress -> completed
cancelled
```

Driver acceptance is required:

- `assigned` + `acceptedAt = null`: `accept`, `decline`
- `accept`: keeps status as `assigned` and sets `acceptedAt`
- `decline`: releases day assignment and returns the day to `upcoming`

Stop lifecycle:

```text
upcoming -> en_route -> arrived -> completed
skipped
```

`skip_stop` is not exposed in Phase 3. There is no approved customer/refund/operations policy for skipping required Tour stops yet.

Allowed actions:

- `accept`
- `decline`
- `start_en_route`
- `arrive`
- `start_day`
- `arrive_stop`
- `complete_stop`
- `complete_day`

Flutter must render and submit only actions returned in `allowedActions`.

Payment gate:

- `payment_pending` Tour bookings can be assigned and viewed by the assigned Driver.
- Driver execution actions require `TourBooking.status` to be `confirmed`, `active`, or `completed`, and `paymentStatus` to be `paid`.

Duty behavior:

- `available`: eligible for new Tour day assignments and may execute already-assigned Tour days.
- `off_duty`: not eligible for new Tour day assignments, but may execute already-assigned Tour days.
- `inactive`: blocked from assignment and execution.

Multi-day completion:

- Completing Day 1 of a 3-day booking does not complete the overall Tour booking.
- The overall Tour booking is completed only after every non-cancelled TourBookingDay is completed.

Not implemented:

- Tour live location/tracking/navigation: Phase 4.
- Tour journey intelligence/ETA/polyline: Phase 4.
- Tour chat: pending contract.
