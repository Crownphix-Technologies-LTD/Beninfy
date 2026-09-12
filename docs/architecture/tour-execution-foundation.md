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
