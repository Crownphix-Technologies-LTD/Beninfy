# Tour V1 Mobile Contract

Tour v1 is backend-authoritative. Flutter must not derive Tour status, payment state, route targets, allowed actions, or pricing locally.

The [commercial-model contract](./tour-commercial-model.md) defines the canonical
catalogue, combination checkout and custom quote gate. The execution wire fields
below retain compatibility; new checkout requests also require `vehicleCategoryId`.

Tour coupons and private post-completion feedback are additive Customer contracts:
[coupon pricing/mutations](./tour-coupons.md) and
[feedback eligibility/submission](./tour-feedback.md). Driver DTOs do not expose private reports.

Catalogue/detail **template** stop `address`, `latitude` and `longitude` may now
all be null for persisted incomplete itinerary drafts. Names/order/descriptions
remain visible. The backend reports `missing_stop_coordinates` and rejects
standard booking until locations are complete. Operational booked stop DTOs and
Driver routing retain non-null executable points; no draft location is promoted
to an execution snapshot. See the draft-location migration and validation rules
in [Tour configuration](./tours.md#save-and-readiness).

## Customer-selected Tour pickup

POST `/api/mobile/v1/customer/tours/:tourId/book` now requires one primary pickup.
Customer Flutter selects it once with the existing Places/location picker and
sends the label/address and selected coordinates. No new provider or server key
is exposed. This example uses **synthetic test coordinates, not a real hotel**:

```json
{
  "startDate": "2026-10-15",
  "travellers": 3,
  "vehicleCategoryId": "saloon",
  "idempotencyKey": "customer-generated-request-id",
  "pickup": {
    "label": "Hotel A",
    "address": "Synthetic test address A",
    "coordinates": { "latitude": 1, "longitude": 2 }
  }
}
```

Validation: label is trimmed, nonempty and at most 160 characters; address is
trimmed, nonempty and at most 300 characters. Latitude/longitude must be finite
JSON numbers within [-90, 90] / [-180, 180]. Missing pickup, text-only pickup,
null/partial coordinates and numeric strings return HTTP 400 VALIDATION_ERROR.
No server geocoding or template fallback supplies a missing Customer pickup.
Valid coordinates are reverse-geocoded server-side to validate Cotonou territory.
The synthetic example coordinates are outside Cotonou and are not bookable.

The response retains the existing `{ tourBooking, pricingBasis }` envelope.
`tourBooking.pickup` is added with exactly this shape:

```json
{
  "label": "Hotel A",
  "address": "Synthetic test address A",
  "coordinates": { "latitude": 1, "longitude": 2 }
}
```

The same booking-level pickup appears on Customer list/detail and Backoffice
booking DTOs. It is distinct from `tourBooking.days[i].pickup`, which has the
same shape and remains the authoritative operational pickup for that day.

In one transaction, Customer pickup is stored in nullable TourBooking columns
`pickupLabel`, `pickupAddress`, `pickupLatitude`, `pickupLongitude` and copied to
every generated TourBookingDay. Explicit Customer pickup takes precedence over
TourItineraryDay.defaultStart. Template defaults are preserved for package meeting
points and future fixed-departure models; no template is mutated by checkout.
Template edits never modify existing booking/day snapshots.

Migration: `20260916120000_tour_booking_pickup` adds only those four nullable
columns. Existing rows are not backfilled: their booking-level pickup serializes
as `{ "label": null, "address": null, "coordinates": null }`, and their existing
day pickups remain authoritative.

Idempotency remains keyed by authenticated Customer + idempotencyKey, not a hash
of serialized pickup. Same key returns the original booking/pickup with HTTP 200,
even if the retry changes pickup or JSON property ordering/whitespace. It never
updates the first intent. New booking intent requires a new key (HTTP 201).
The key remains optional for compatibility; Flutter should always send one.
Concurrent serialization conflicts receive bounded transaction retries.

### Operations pickup override

Existing endpoint: PATCH `/api/admin/tour-bookings/days/:dayId`, with existing
`tours` permission. Backoffice ? Tour bookings ? open booking ? **Change this
day's pickup** reuses Places and requires **Save Day Pickup**.

```json
{
  "pickup": {
    "label": "Hotel C",
    "address": "Synthetic test address C",
    "coordinates": { "latitude": 3, "longitude": 4 }
  }
}
```

Response remains `{ "tour": <Driver Tour detail DTO> }`; the saved pickup is at
`tour.day.pickup`. Driver/fleet assignment fields remain optional and supported.
A pickup-only request preserves assignment, acceptance and lifecycle timestamps.
Pickup edits are allowed in upcoming, assigned, driver_en_route and driver_arrived;
started/completed/cancelled days and completed/cancelled bookings reject edits
with TOUR_ACTION_NOT_ALLOWED. Mixed assignment/pickup requests still obey existing
assignment restrictions and commit atomically. Pickup cannot be cleared.

Only the selected booked day changes: booking-level pickup, sibling days,
itinerary stops and template defaultStart stay unchanged. Hotel A on Days 1/2/3
can become Hotel A / Hotel C / Hotel A without changing the booking pickup.

### Driver, tracking and readiness

Driver detail continues reading TourBookingDay pickup. Customer tracking keeps
`currentDay.pickup` and the existing `routeTarget`: driver_en_route targets the
booked day pickup; driver_arrived has no active ETA route; in_progress targets
the current stop. No parallel coordinates or Driver business logic were added.

Saving a day pickup atomically deletes its journey snapshot. Cache reuse/failure
fallback checks destination coordinates as well as target type/stop ID. A route
request that finishes after pickup changes cannot restore the old route: cache
writes lock/recheck the day target. Missing route data stays unavailable until
recalculated; it is never replaced by a fabricated route or ETA.

Template `executionReady` still describes itinerary days/stops, independently of
customer-specific pickup. Checkout validates the required pickup separately.
A ready template can have no defaultStart. Flutter must implement this request
addition before physical Tour acceptance; no Flutter files are changed here.

## Pricing

Tour pricing uses the selected Vehicle category's `TourCommercialRate` per
selected canonical Tour. See [the commercial contract](./tour-commercial-model.md)
for the exact bundle, addon, custom-quote and migration shapes.

- Not per traveller.
- Not multiplied by traveller count.
- Vehicle category determines the per-Tour component price.
- Traveller count is operational manifest data only.
- `pricingBasis` is `vehicle_per_selected_tour` or `operations_quote_required`.
- Gogotinkpo adds 20% to Cotonou's component only.
- Ganvie is transportation only. One bundle owns one booking/reference/payment.

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
  "couponsSupported": true,
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
