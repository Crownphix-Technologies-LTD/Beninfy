# Production Trip Lifecycle

Status: IMPLEMENTED

The existing domain model remains authoritative:

```text
Booking
└── BookingLeg
```

`Booking` is commercial state. `BookingLeg.status` is operational execution state. No separate `Trip` model was introduced because `BookingLeg` already carries the operational unit, driver assignment, fleet assignment, direction, and departure date.

## Design Decision

The safest design is to extend `BookingLeg.status` and add server-owned lifecycle timestamps. A second operational status field or separate Trip model would create competing sources of truth for admin views, mobile DTOs, payment settlement, and availability.

## Implemented Operational States

- `payment_pending`
- `reserved`
- `unassigned`
- `assigned`
- `dispatched` legacy active state
- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`
- `completed`
- `cancelled`

Terminal states are `completed` and `cancelled`.

## Driver Actions

Driver APIs are action based, not status-patch based:

- `accept`
- `decline`
- `start_en_route`
- `dispatch`
- `arrive`
- `passenger_onboard`
- `start_trip`
- `complete`
- `cancel`

The backend decides the resulting state using `src/lib/tripLifecycle.ts`.

## Cancellation And Decline

Driver decline/cancel releases the assignment and returns the leg to `unassigned`. It does not cancel the customer journey.

Customer/admin booking cancellation is a different commercial operation and marks active legs `cancelled`.

## Timestamps

Added to `BookingLeg`:

- `assignedAt`
- `acceptedAt`
- `declinedAt`
- `enRouteAt`
- `arrivedAt`
- `passengerOnboardAt`
- `startedAt`
- `completedAt`
- `cancelledAt`
- `cancelledBy`
- `cancellationReasonCode`
- `declineReasonCode`

Server time is authoritative.

## Atomic Enforcement

Driver transitions use guarded database updates with current status, driver assignment, fleet assignment, and booking commercial state in the update predicate. Duplicate requests are only idempotent when the current state already matches the requested action result.

## Booking Completion

The parent booking is marked `completed` only when every required leg is `completed`. Round-trip outbound completion does not complete the booking while the return leg remains active.

## Driver Availability

`Driver.status` remains a duty/admin availability field. It is not overloaded as online presence or active trip state. Active trip load is determined from assigned `BookingLeg` records.

## Future Hooks

The transition result is the boundary future integrations should use for push, realtime, GPS tracking activation, customer notifications, feedback, and operations workflows.

This phase does not implement GPS, realtime location, push notifications, chat, or driver earnings.
