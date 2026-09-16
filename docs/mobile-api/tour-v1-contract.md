# Tour V1 Mobile Contract

Tour v1 is backend-authoritative. Flutter must not derive Tour status, payment state, route targets, allowed actions, or pricing locally.

## Pricing

Tour pricing is a fixed package snapshot from `Tour.startingFromNGN`.

- Not per traveller.
- Not multiplied by traveller count.
- Not vehicle-dependent.
- Traveller count is operational manifest data only.
- `pricingBasis` remains `tour.startingFromNGN` for catalogue compatibility.

## Payment Ownership

`Payment` belongs to exactly one owner:

- ride payment: `bookingId` set, `tourBookingId` null
- Tour payment: `tourBookingId` set, `bookingId` null

The database enforces this through `Payment_exactly_one_owner_check`.

Tour payment endpoints:

- `GET /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment`
- `POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment`
- `POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment/verify`

Payment initialization request:

```json
{
  "provider": "paystack",
  "currency": "NGN",
  "locale": "en"
}
```

Payment DTO:

```json
{
  "paymentId": "payment_id",
  "tourBookingId": "tour_booking_id",
  "tourReference": "BFYT-0123ABCD45",
  "status": "pending",
  "amount": {
    "value": 300000,
    "currency": "NGN",
    "minorUnit": "kobo",
    "minorValue": 30000000
  },
  "provider": "paystack",
  "paymentReference": "BFYT-P-ABC123-01ABCD",
  "providerReference": "paystack_reference",
  "checkout": {
    "mode": "hosted_checkout",
    "checkoutUrl": "https://checkout.paystack.com/...",
    "authorizationUrl": "https://checkout.paystack.com/...",
    "accessCode": "paystack_access_code"
  },
  "expiresAt": "2026-10-15T12:30:00.000Z",
  "paidAt": null,
  "canRetry": false,
  "failureCode": null,
  "couponsSupported": false,
  "updatedAt": "2026-10-15T12:00:00.000Z"
}
```

Zero-payable Tours are confirmed without an external provider.

## Driver Tour Detail

Endpoints:

- `GET /api/mobile/v1/driver/tours`
- `GET /api/mobile/v1/driver/tours/:tourBookingDayId`
- `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions`

Driver detail DTO:

```json
{
  "tourBookingId": "tour_booking_id",
  "tourBookingDayId": "tour_booking_day_id",
  "reference": "BFYT-0123ABCD45",
  "tour": {
    "title": "Ouidah Heritage Tour",
    "titleFr": null,
    "destination": "Ouidah",
    "destinationFr": null,
    "country": "Benin Republic",
    "countryFr": null,
    "image": "/images/tours/ouidah.jpg"
  },
  "customer": {
    "id": "customer_id",
    "name": "Customer One",
    "email": "customer@example.com",
    "phone": "+22951019134"
  },
  "group": {
    "travellerCount": 3,
    "passengerSummary": "3 travellers"
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
    "title": "Ouidah day",
    "titleFr": null,
    "description": null,
    "descriptionFr": null,
    "pickup": {
      "label": "Hotel pickup",
      "address": "Cotonou hotel",
      "coordinates": { "latitude": 6.3703, "longitude": 2.3912 }
    },
    "end": {
      "label": "Hotel dropoff",
      "address": "Cotonou hotel",
      "coordinates": { "latitude": 6.3703, "longitude": 2.3912 }
    },
    "timestamps": {
      "assignedAt": "2026-10-15T00:00:00.000Z",
      "acceptedAt": null,
      "driverEnRouteAt": null,
      "driverArrivedAt": null,
      "startedAt": null,
      "completedAt": null,
      "cancelledAt": null
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
  "driver": {
    "id": "driver_id",
    "name": "Driver One",
    "phone": "+22951019134",
    "email": "driver@example.com",
    "status": "available"
  },
  "stops": [],
  "currentStop": null,
  "nextStop": null,
  "progress": {
    "completedStopCount": 0,
    "totalStopCount": 2,
    "currentStopNumber": null
  },
  "allowedActions": ["accept", "decline"]
}
```

Allowed actions:

- `accept`
- `decline`
- `start_en_route`
- `arrive`
- `start_day`
- `arrive_stop`
- `complete_stop`
- `complete_day`

`skip_stop` is unsupported in v1.

## Decline And Reassignment

`decline` is day-scoped and does not cancel the Tour booking.

Result:

- `TourBookingDay.status = upcoming`
- `assignedDriverId = null`
- `assignedFleetVehicleId = null`
- `assignedAt = null`
- `acceptedAt = null`
- day is ready for reassignment
- audit action: `driver_tour_decline`

Admin reassignment is authoritative immediately. Driver A loses detail/action/location access when `assignedDriverId` changes to Driver B.

## Location Publishing

Endpoint:

- `POST /api/mobile/v1/driver/tours/:tourBookingDayId/location`

Payload:

```json
{
  "latitude": 6.3703,
  "longitude": 2.3912,
  "accuracyMeters": 12,
  "headingDegrees": 90,
  "speedMetersPerSecond": 4.2,
  "capturedAt": "2026-10-15T12:00:00.000Z",
  "sequence": 42
}
```

Accepted day states:

- `driver_en_route`
- `driver_arrived`
- `in_progress`

Rules:

- authenticated Driver must still be the current `assignedDriverId`
- coordinate, accuracy, heading, speed, timestamp, and sequence are validated
- older packets are rejected with `LOCATION_STALE`
- reassigned Drivers are rejected with `TOUR_DAY_NOT_ASSIGNED`
- terminal days return `TRACKING_NOT_ACTIVE`

Tracking freshness reuses ride tracking thresholds:

- fresh window: `TRACKING_LOCATION_FRESH_SECONDS`, default 90 seconds
- expiry window: `TRACKING_LOCATION_EXPIRES_SECONDS`, default 15 minutes
- max stale submitted point: `TRACKING_LOCATION_MAX_STALE_SECONDS`, default 15 minutes
- max future submitted point: `TRACKING_LOCATION_MAX_FUTURE_SECONDS`, default 5 minutes

## Customer Tracking

Endpoint:

- `GET /api/mobile/v1/customer/tour-bookings/:tourBookingId/tracking`

Response envelope:

```json
{
  "tracking": {
    "tourBookingId": "tour_booking_id",
    "reference": "BFYT-0123ABCD45",
    "status": "active",
    "paymentStatus": "paid",
    "currentDay": {},
    "dayNumber": 1,
    "totalDays": 3,
    "currentStop": null,
    "nextStop": null,
    "progress": {
      "completedStopCount": 0,
      "totalStopCount": 2
    },
    "driver": {},
    "vehicle": {},
    "trackingStatus": "live",
    "locationFresh": true,
    "latestLocation": {},
    "journeyIntelligence": {
      "target": "stop",
      "targetStopId": "tour_stop_execution_id",
      "routeAvailable": true,
      "distanceMeters": 11200,
      "durationSeconds": 1080,
      "encodedPolyline": "encoded_polyline",
      "routePolyline": "encoded_polyline",
      "distanceRemainingMeters": 11200,
      "estimatedArrivalAt": "2026-10-15T12:18:00.000Z",
      "estimatedDurationSeconds": 1080,
      "calculatedAt": "2026-10-15T12:00:00.000Z",
      "freshness": "fresh"
    },
    "routeTarget": {
      "type": "stop",
      "id": "tour_stop_execution_id",
      "coordinates": { "latitude": 6.3703, "longitude": 2.3912 }
    },
    "updatedAt": "2026-10-15T12:00:00.000Z"
  }
}
```

Route target rules:

- `driver_en_route`: latest Driver coordinate to day pickup
- `driver_arrived`: no active route
- `in_progress`: latest Driver coordinate to current stop
- `completed` or `cancelled`: no active route
- between days: no active location publishing and no active route

`journeyIntelligence.target` and `routeTarget.type` must match. For `stop` targets, `journeyIntelligence.targetStopId` is the authoritative `TourStopExecution.id`; Flutter must not infer the current stop from coordinates.

The top-level `journeyIntelligence` object and `currentDay.tracking.journey` are the same canonical snapshot projection. They must not contradict each other in one response.

Journey cache identity includes TourBookingDay, target type, target stop ID, last routed Driver coordinate, and calculation timestamp.

## Cancellation

Customer mobile cancellation is supported only for unpaid `payment_pending` Tour bookings with `paymentStatus = pending`.

Paid `confirmed`, `active`, `completed`, and already terminal bookings are not self-cancelled by mobile v1. Paid cancellation and refunds require operations review.

Cancellation stops Driver actions, location publishing, future day execution, and active journey intelligence by moving the booking/day state to terminal values.

## Chat

Tour chat is unsupported in v1.

Future implementation should be `TourBookingDay`-scoped REST chat. It must authorize only the owning Customer and the currently assigned Driver.

## Error Codes

| Code | HTTP | Applies to | Meaning |
| --- | --- | --- | --- |
| `TOUR_NOT_FOUND` | 404 | Customer | Tour catalogue item not found. |
| `TOUR_NOT_EXECUTION_READY` | 409 | Customer | Tour has no complete executable itinerary. |
| `TOUR_BOOKING_NOT_FOUND` | 404 | Customer/Driver | Unknown booking or not owned/assigned. |
| `TOUR_BOOKING_DATE_INVALID` | 400 | Customer | Start date is invalid. |
| `TOUR_BOOKING_NOT_PAYABLE` | 409 | Customer | Booking is not in payable pending state. |
| `TOUR_TRAVELLER_COUNT_INVALID` | 400 | Customer | Traveller count outside 1 to 30. |
| `TOUR_DAY_NOT_FOUND` | 404 | Driver/Admin | Tour day not found. |
| `TOUR_DAY_NOT_ASSIGNED` | 409 | Driver | Driver is not currently assigned to that day. |
| `TOUR_DAY_NOT_READY` | 409 | Driver/Admin | Day lacks payment, pickup, Driver, or vehicle readiness. |
| `TOUR_ACTION_NOT_ALLOWED` | 409 | Driver/Admin/Customer | Requested Tour action is not allowed in current state. |
| `TOUR_STOP_NOT_CURRENT` | 409 | Driver | Stop action targets a non-current stop. |
| `TRACKING_NOT_ACTIVE` | 409 | Driver/Customer | Location tracking is not active for this Tour day. |
| `LOCATION_INVALID` | 400 | Driver | Location payload is invalid. |
| `LOCATION_STALE` | 409 | Driver | Location packet is older than authoritative stored state. |
| `LOCATION_RATE_LIMITED` | 429 | Driver | Too many location updates. |
| `PAYMENT_PROVIDER_UNAVAILABLE` | 503 | Customer | Payment provider is not configured or unavailable. |
| `PAYMENT_ALREADY_COMPLETED` | 409 | Customer | Booking already has completed payment. |
| `PAYMENT_NOT_FOUND` | 404 | Customer | No matching payment exists. |
