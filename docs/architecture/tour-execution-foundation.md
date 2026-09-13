# Tour Execution Foundation

Tour execution is modeled in phases so catalogue content does not accidentally become operational work.

## Phase 1 Source of Truth

Implemented:

- `Tour` remains the reusable catalogue package.
- `TourItineraryDay` stores reusable ordered day templates for a Tour.
- `TourItineraryStop` stores reusable ordered stop templates with numeric coordinates.
- Admin can read/replace a Tour itinerary template through `/api/admin/tours/:id/itinerary`.
- Mobile Tour catalogue/detail responses include server-derived `executionReady`, `executionReadinessReason`, and `itineraryDays`.

Not implemented in Phase 1:

- `TourBooking`
- `TourBookingDay`
- `TourStopExecution`
- Tour payment ownership
- Driver Tour assignment
- Driver Tour lifecycle actions
- Tour live tracking
- Tour journey intelligence
- Tour chat
- Backoffice live Tour monitor

## Future Operational Model

A multi-day Tour is not one continuous ride. The intended operational structure is:

```text
Tour
  -> TourItineraryDay
  -> TourItineraryStop

TourBooking
  -> TourBookingDay
  -> TourStopExecution
```

Driver and vehicle assignment should be made per `TourBookingDay`, because a different Driver or fleet unit may operate different days.

When a Tour is booked, execution rows should snapshot the configured day/stop titles, order, addresses, coordinates, and price-relevant data. Later edits to the reusable template must not silently change already-booked execution.

## Readiness Rule

`executionReady` is derived by the backend:

- false with `no_itinerary_days` when no days exist
- false with `missing_day_stop` when any day has no stops
- false with `missing_stop_coordinates` when required stop coordinates are invalid
- true with `ready` when all days have ordered stops with valid coordinates

Flutter must treat this field as informational until booking endpoints exist. It must not create local Tour execution from catalogue data.

## Phase 2 Booking Foundation

Implemented:

- `TourBooking` stores a customer-owned operational booking with human-readable references like `BFYT-0123ABCD45`.
- `TourBookingDay` snapshots each configured reusable itinerary day when the booking is created.
- `TourStopExecution` snapshots every configured stop for each booked day.
- Customer mobile endpoints can create and read only the authenticated customer's Tour bookings.
- Backoffice can read Tour bookings and their day/stop snapshots.

Lifecycle values currently stored:

- `TourBooking.status`: `payment_pending`, `confirmed`, `active`, `completed`, `cancelled`
- `TourBooking.paymentStatus`: `pending`, `paid`, `failed`, `refunded`
- `TourBookingDay.status`: `upcoming`, `assigned`, `driver_en_route`, `driver_arrived`, `in_progress`, `completed`, `cancelled`
- `TourStopExecution.status`: `upcoming`, `en_route`, `arrived`, `completed`, `skipped`

Booking is allowed only when the source Tour is execution-ready. Tours without complete structured itinerary remain visible in the catalogue, but customer booking creation returns `TOUR_NOT_EXECUTION_READY`.

Pricing for Phase 2 is a fixed authoritative snapshot from `Tour.startingFromNGN`. This preserves today's catalogue meaning and does not invent traveller, coupon, or vehicle-specific Tour pricing. Future Tour pricing should be modeled separately before external payment initialization is enabled.

Phase 4 finalizes Tour payment ownership. `Payment` rows now belong to exactly one owner:

- ride `Booking` through `Payment.bookingId`
- Tour booking through `Payment.tourBookingId`

The database check constraint rejects rows that have both owners or neither owner. Shared Paystack and PayOnUs settlement code branches by this explicit owner, so a ride webhook cannot mutate a Tour booking and a Tour webhook cannot mutate a ride booking.

## Frozen Tour V1 Contract

Implemented:

- Customer Tour booking creation and read APIs.
- Customer Tour payment status, initialization, and verification APIs.
- Customer unpaid Tour cancellation API.
- Backoffice day-scoped Driver/fleet assignment and reassignment before active execution.
- Driver Tour assignment list, detail, lifecycle action, and location publishing APIs.
- Customer Tour live tracking with latest Driver location, freshness, current day, current stop, next stop, and optional Google Routes journey intelligence.
- Backoffice live Tour monitoring fields for day lifecycle, stop progress, latest location freshness, and journey ETA.

Frozen v1 rulings:

- Tour price is a fixed package snapshot from `Tour.startingFromNGN`. It is not per traveller, not vehicle-dependent, and not multiplied by traveller count.
- Tour coupons are unsupported in v1.
- Tour chat is unsupported in v1. Future chat should be scoped to `TourBookingDay`, not ride `BookingLeg`.
- `decline` does not cancel the Tour booking. It clears the day Driver, fleet vehicle, assignment timestamps, acceptance timestamp, and returns the day to `upcoming` for reassignment.
- Reassignment is authoritative immediately. The previously assigned Driver loses detail, action, and location-publishing access because every Driver endpoint checks the current `assignedDriverId`.
- Mobile self-cancellation is limited to unpaid `payment_pending` Tour bookings. Paid cancellation/refund requires operations review and must not invent automatic refund percentages.
- Multi-day Tours are day-scoped, not continuously tracked overnight. Completing Day 1 does not complete the Tour when future non-cancelled days remain.

Operational terminal behavior:

- Cancelled Tour bookings stop Driver actions because `allowedActions` returns empty when the Tour booking or day is cancelled.
- Cancelled/completed days stop location publishing because the Driver location endpoint accepts only `driver_en_route`, `driver_arrived`, and `in_progress`.
- Cancelled/completed days stop active journey intelligence because no route target is produced for terminal day states.

## Phase 3 Driver Execution Foundation

Implemented:

- Driver and fleet assignment are day-scoped through `TourBookingDay`.
- Backoffice can assign or reassign a Driver and fleet vehicle before a Tour day enters active execution.
- Driver mobile can list assigned Tour days, open an authoritative Tour day DTO, and execute explicit lifecycle actions.
- Driver acceptance is required before `start_en_route`.
- Stop progression is server-owned using ordered `TourStopExecution` rows.

Tour Day lifecycle:

```text
upcoming -> assigned -> driver_en_route -> driver_arrived -> in_progress -> completed
cancelled
```

Tour Stop lifecycle:

```text
upcoming -> en_route -> arrived -> completed
skipped
```

Phase 3 intentionally does not expose `skip_stop` because the business policy for skipping required Tour stops is not approved.

Execution is payment-gated. A Driver may see an assigned Tour day, but lifecycle actions are rejected until the Tour booking is paid and execution-approved.

Still not implemented:

- Tour payment initialization
- Tour GPS publishing
- Customer live Tour tracking
- Tour journey intelligence
- Tour chat
