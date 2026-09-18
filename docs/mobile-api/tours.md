# Tours

Frozen Tour v1 execution, payment, tracking, cancellation, and error contracts are documented in `docs/mobile-api/tour-v1-contract.md`.

The [Tour commercial model](./tour-commercial-model.md) supersedes the historical
single-package booking/pricing examples below. New checkout requests require
`vehicleCategoryId`; combination checkout uses one booking and ordered product Days.

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
  "idempotencyKey": "customer-generated-request-id",
  "pickup": {
    "label": "Hotel A",
    "address": "Synthetic test address A",
    "coordinates": { "latitude": 1, "longitude": 2 }
  }
}
```

Pickup is required; the example above uses synthetic coordinates, not a real hotel. See [the exact pickup contract](./tour-v1-contract.md#customer-selected-tour-pickup) for validation, DTOs and Operations overrides.

`idempotencyKey` is optional but recommended for mobile double-tap protection. It must be 8 to 120 characters using letters, numbers, `.`, `_`, `:`, or `-`. Reusing the same key for the same authenticated customer returns the existing Tour booking with HTTP `200`; a fresh create returns HTTP `201`.

Create success response:

```json
{
  "tourBooking": {
    "id": "tour_booking_id",
    "pickup": {
      "label": "Hotel A",
      "address": "Synthetic test address A",
      "coordinates": { "latitude": 1, "longitude": 2 }
    },
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
- `TOUR_BOOKING_NOT_PAYABLE` when a Tour booking is not in a payable pending state.

Launch limitations:

- Tour payment initialization is supported through explicit Tour-owned `Payment` rows.
- Tour coupons are not supported because the current coupon model is ride-booking-owned.
- Customer Tour cancellation is supported only before payment is completed. Refund handling remains an operations policy.
- Driver Tour execution, Customer live Tour tracking, and Tour journey intelligence are implemented for paid Tour bookings.
- Tour chat is not supported in v1.

Backoffice booking visibility and day operations:

- `GET /api/admin/tour-bookings`
- `GET /api/admin/tour-bookings/:id`
- `PATCH /api/admin/tour-bookings/days/:dayId` (assignment and explicit pickup override)
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

Canonical Driver transition table:

| Screen/action | Endpoint | Required payload | Required status | Result |
| --- | --- | --- | --- | --- |
| Tour assignment list | `GET /api/mobile/v1/driver/tours` | none | assigned Driver | Returns day-scoped Tour assignments. |
| Tour detail | `GET /api/mobile/v1/driver/tours/:tourBookingDayId` | none | assigned Driver | Returns customer, vehicle, day, stops, progress, and `allowedActions`. |
| Accept assignment | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions` | `{ "action": "accept" }` | day `assigned`, `acceptedAt = null` | Sets `acceptedAt`; day remains `assigned`. |
| Decline assignment | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions` | `{ "action": "decline" }` | day `assigned`, `acceptedAt = null` | Releases Driver/vehicle assignment and returns day to `upcoming`. |
| Start heading to pickup | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions` | `{ "action": "start_en_route" }` | day `assigned`, accepted | Sets day to `driver_en_route`. |
| Arrive at pickup | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions` | `{ "action": "arrive" }` | day `driver_en_route` | Sets day to `driver_arrived`. |
| Start Tour day | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions` | `{ "action": "start_day" }` | day `driver_arrived` | Sets day and first pending stop to active execution. |
| Publish live location | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/location` | latitude/longitude payload | day `driver_en_route`, `driver_arrived`, or `in_progress` | Stores latest day-scoped Driver location. |
| Arrive at stop | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions` | `{ "action": "arrive_stop", "stopId": "..." }` | stop `en_route` | Sets stop to `arrived`. |
| Complete stop | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions` | `{ "action": "complete_stop", "stopId": "..." }` | stop `arrived` | Sets stop to `completed` and advances next stop where applicable. |
| Complete day | `POST /api/mobile/v1/driver/tours/:tourBookingDayId/actions` | `{ "action": "complete_day" }` | day `in_progress`, all required stops complete | Sets day to `completed`; completes Tour booking only when all active days are completed. |

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

## Tour Payment V1

Tour payment uses the shared Payment model with explicit ownership:

- ride payments set `bookingId`
- Tour payments set `tourBookingId`
- exactly one owner must be present

Customer endpoints:

- `GET /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment`
- `POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment`
- `POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment/verify`

Payment initialization supports the launch mobile providers:

- `paystack`
- `payonus`

The backend remains authoritative for:

- Tour price
- NGN launch currency
- payment reference
- provider initialization
- webhook/verification settlement
- `TourBooking.status`
- `TourBooking.paymentStatus`

Tour pricing now follows [the commercial model](./tour-commercial-model.md):
Vehicle category rate per selected Tour, optional Cotonou-only Gogotinkpo addon,
one booking for a combination of products, and an Operations quote gate for
custom itineraries. Traveller count is capacity/operations data, not a multiplier.

Tour coupons are unsupported in v1. Ride coupons must not be silently applied to Tour bookings.

Pending custom quotes cannot initialize payment; zero in the legacy amount
column is not a free booking. Existing historical free-booking behavior remains
behind the established payment path for non-quote bookings.

## Tour Live Tracking V1

Driver endpoint:

- `POST /api/mobile/v1/driver/tours/:tourBookingDayId/location`

Only the currently assigned Driver can publish location for a Tour day. Location publishing is accepted only while the TourBookingDay is:

- `driver_en_route`
- `driver_arrived`
- `in_progress`

Location publishing stops after:

- `completed`
- `cancelled`

Tour live location is stored on `LatestTourLocation` keyed by `tourBookingDayId`. It uses the same validation quality as ride tracking:

- finite latitude/longitude
- coordinate bounds
- accuracy bounds
- heading bounds
- speed bounds
- captured timestamp sanity
- sequence/capturedAt stale-packet protection

Customer endpoint:

- `GET /api/mobile/v1/customer/tour-bookings/:tourBookingId/tracking`

The tracking response is customer-owned and backend-authoritative. It includes:

- TourBooking status
- current TourBookingDay
- Day X of Y
- current stop
- next stop
- stop progress
- assigned Driver
- assigned Vehicle
- latest Driver location
- location freshness
- optional journey intelligence

## Tour Journey Intelligence V1

Tour routing reuses the backend-only Google Compute Routes architecture. Flutter never receives Google server credentials and never submits arbitrary routing targets.

Target policy:

- `driver_en_route`: Driver latest coordinate -> Tour day pickup
- `driver_arrived`: no active pickup ETA route
- `in_progress`: Driver latest coordinate -> authoritative current stop
- `completed` or `cancelled`: no active route

No Driver location means no ETA or route polyline. The backend must not fabricate an origin from pickup, previous stops, or the Tour destination.

Tour journey snapshots are stored on `TourJourneySnapshot` keyed by `tourBookingDayId`. Cache identity includes:

- TourBookingDay
- target type
- target stop ID for stop routes
- last routed Driver coordinate
- calculatedAt/expiresAt

Google Routes is not called on every customer poll. Recalculation occurs only when the cache is stale, the Driver has moved meaningfully, or the lifecycle target changes.

## Cancellation and Refund V1

Customer self-cancellation is intentionally narrow:

- unpaid `payment_pending` Tour bookings can be cancelled by the owning Customer
- paid, confirmed, active, or completed Tour bookings are not auto-cancelled through mobile v1

Refund policy is separate from cancellation state. If a paid Tour needs cancellation or refund review, operations/backoffice must handle it under a later explicit refund workflow.

Endpoint:

- `POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/cancel`

## Chat V1 Ruling

Tour chat is unsupported in v1.

Preferred future architecture is `TourBookingDay`-scoped chat because Drivers and Vehicles can differ by day. It should not pretend a Tour day is a ride `BookingLeg`, and it should be implemented only after a safe shared or Tour-specific conversation model is approved.

## Backoffice itinerary editor

Open **Backoffice → Tours → Manage itinerary** on an existing Tour. The editor is
at `/{locale}/admin/tours/{id}/itinerary` and requires the existing `tours`
permission, as do both canonical itinerary API methods.

The editor manages ordered days and ordered stop cards, EN/FR titles and
descriptions, stop duration/required flags, default pickup and optional end
locations. Move-up/down controls renumber days/stops sequentially on save.
Internal template IDs are never editable. Package price is displayed from
`Tour.startingFromNGN` for display. Effective booking prices are frozen from
Tour vehicle rates or an approved Operations quote, not multiplied by travellers.

Only an empty draft offers the explicit **Use 3-day Benin itinerary (names only)** action:

- **Day 1 — Cotonou City Tour:** Graffiti Wall, Amazon Statue, Art Market,
  Abandoned Plane, Cornetto.
- **Day 2 — Ouidah Tour:** Point of No Return, Zinsou Foundation,
  Snake Temple, Casa del Papa.
- **Day 3 — Ganvié Tour:** Village on Water, Babs Dock.

This action only fills an unsaved draft. It supplies **no addresses or
coordinates** and requires **Save Changes** to persist. Opening Manage itinerary
loads the saved days and never inserts or replaces them with this starter. For
an existing saved itinerary, the starter remains unavailable even if its days
are removed from the unsaved editor draft.

### Select actual locations

For each stop, expand **Edit stop**, search its actual location, select a Google
result and check the map preview. Coordinates populate from that selection.
Changing the address clears the previous coordinates. The existing Beninfy
Google Maps/Places browser components are reused with
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; no second geocoder or new Places API endpoint
was introduced. The key must already have Maps JavaScript/Places access and
appropriate website referrer configuration. If search is unavailable, Operations
may explicitly enable manual entry using a verified coordinate source. No
coordinates are guessed. The existing preview has no draggable-marker control.

Under each day's details, optionally configure **Default pickup / start** for a
package meeting point. **Stop 1 is not pickup.** New private Tour bookings require
one Customer-selected pickup, which overrides template defaultStart on all booked
days. Keep optional end blank unless an actual end location is specified.

Operations can change a booked day's pickup through Tour bookings, without
changing the original booking-level pickup, sibling days or source template.
See [the frozen pickup contract](./tour-v1-contract.md#customer-selected-tour-pickup).

### Save and readiness

Use **Save Changes**. Named stops can be saved with no location. Their address,
latitude and longitude persist as null and the catalogue still exposes their
names/order/descriptions. A location must be either wholly absent or contain a
nonempty address and valid latitude/longitude; partial states are rejected.
An empty day can be saved, but the backend reports it as not ready. Names-only
stops report `missing_stop_coordinates`, with a count of stops needing locations.
Operations can configure and save one complete location at a time.

`20260918120000_tour_itinerary_draft_locations` makes only template stop address/
latitude/longitude nullable and enforces all-or-none location integrity. Existing
configured stops and operational booking snapshots are not rewritten.
Standard booking creation and quote preview revalidate readiness on the server.
Incomplete templates return `TOUR_NOT_EXECUTION_READY` (409); Operations quote
approval also requires complete stops. `TourStopExecution` still requires an
address and non-null coordinates. Custom review requests never copy incomplete
template points into execution snapshots.

The prominent **Ready for booking / Not ready for booking** status always comes
from the last saved backend response (`executionReady` and
`executionReadinessReason`). Unsaved changes do not change that displayed truth.
Guidance identifies missing days, days without stops and stops without valid
coordinates. There is no manual readiness checkbox.

The frozen readiness rule does **not** require default pickup coordinates. The
editor explains that Customer pickup is required at checkout instead. No template
readiness reason or Tour lifecycle/payment state is added.

The editor retains failed drafts, marks unsaved changes, confirms destructive
removal/reload and navigation through its Back button or Admin links, and uses
the browser's unload warning. Saving disables editing until the server returns.
After success it replaces the draft with the authoritative response.

GET and PUT responses additionally expose `updatedAt` (ISO timestamp). The
editor submits optional `expectedUpdatedAt` on PUT. A stale version receives
HTTP 409, retaining the local draft rather than overwriting newer work. Template
replacement locks the Tour and returns its saved itinerary/readiness from the
same transaction. Existing API clients omitting this optional field remain
compatible.

Template edits only replace `TourItineraryDay`/`TourItineraryStop`. Existing
`TourBookingDay` and `TourStopExecution` snapshots remain unchanged. Newly created
bookings receive the newly saved plan. The existing Customer catalogue exposes
`itineraryDays` and computed readiness without Flutter changes; existing
catalogue cache refresh behavior still applies.

### Verification

`tests/admin-tour-itinerary.test.ts` covers the names-only outline, ordering,
coordinates, readiness, permissions and editor rendering.
`tests/tour-itinerary-database.test.ts` exercises real save/reload, failed-save
atomicity, concurrent/stale editor protection and booking snapshot isolation.
To run its optional database suite, set `DATABASE_URL` and
`TOUR_ITINERARY_TEST_DATABASE_URL` to the same disposable localhost database
named `beninfy_tour_test...` or `beninfy_dispatch_test...`, with existing migrations
applied, including the draft-location migration. Never use production data.
