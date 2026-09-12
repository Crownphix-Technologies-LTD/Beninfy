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
