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

Payment is deliberately a foundation only in Phase 2. Existing `Payment` rows are owned by ride `Booking` records and current settlement code assumes ride bookings. Tour bookings therefore store payment state directly for now and do not initialize Paystack or PayOnUs.

Still not implemented:

- Driver Tour assignment actions
- Driver Tour lifecycle transitions
- Customer Tour cancellation/refund
- Tour coupons
- Tour live tracking and route intelligence
- Tour chat

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
