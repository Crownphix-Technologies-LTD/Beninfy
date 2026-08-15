# Trip Lifecycle

Status: IMPLEMENTED

`Booking` is the commercial/customer booking. `BookingLeg` is the operational journey unit. A round trip has two independent legs: outbound and return.

## Implemented Leg States

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

Terminal states: `completed`, `cancelled`.

## Driver Actions

Drivers send action commands. They do not submit arbitrary statuses.

`POST /api/mobile/v1/driver/trips/:bookingLegId/actions`

```json
{
  "action": "arrive",
  "reasonCode": "optional_structured_reason"
}
```

Allowed actions:

- `accept`
- `decline`
- `start_en_route`
- `dispatch` legacy alias for `start_en_route`
- `arrive`
- `passenger_onboard`
- `start_trip`
- `complete`
- `cancel`

## Transition Matrix

| Action              | From                                            | To                  | Driver                  | Fleet        | Booking   |
| ------------------- | ----------------------------------------------- | ------------------- | ----------------------- | ------------ | --------- |
| `accept`            | `assigned`                                      | `assigned`          | required                | not required | confirmed |
| `decline`           | `assigned`, `driver_en_route`                   | `unassigned`        | required, then released | not required | confirmed |
| `start_en_route`    | `assigned`                                      | `driver_en_route`   | required                | required     | confirmed |
| `dispatch`          | `assigned`                                      | `driver_en_route`   | required                | required     | confirmed |
| `arrive`            | `driver_en_route`, `dispatched`                 | `driver_arrived`    | required                | required     | confirmed |
| `passenger_onboard` | `driver_arrived`                                | `passenger_onboard` | required                | required     | confirmed |
| `start_trip`        | `passenger_onboard`                             | `in_progress`       | required                | required     | confirmed |
| `complete`          | `in_progress`                                   | `completed`         | required                | required     | confirmed |
| `cancel`            | `assigned`, `driver_en_route`, `driver_arrived` | `unassigned`        | required, then released | not required | confirmed |

Duplicate actions are idempotent only when the current state already represents the action result, for example `arrive` on `driver_arrived`.

## Decline And Cancel Semantics

Driver `decline` and driver `cancel` do not cancel the customer booking. They release the driver assignment and return the leg to `unassigned` for operations.

Customer/admin booking cancellation is separate and marks the booking and active legs as cancelled.

## Booking Completion

One-way booking: completed when its only leg is completed.

Round trip: completed only after all required legs are completed. Completing outbound does not complete the return leg or the parent booking.

## DTO Fields

Driver trip DTOs include:

- `status`: authoritative backend leg status
- `driverStatus`: driver-safe lifecycle code
- `allowedActions`: server-computed actions
- `timestamps`: server-owned lifecycle timestamps

Customer booking leg DTOs include:

- `status`: authoritative backend leg status
- `customerStatus`: customer-safe lifecycle code

Flutter should localize display text in EN/FR from these stable codes.

## Availability Impact

The following statuses block fleet availability:

- `reserved`
- `unassigned`
- `assigned`
- `dispatched`
- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`

The following do not block availability:

- `payment_pending`
- `completed`
- `cancelled`

## Future Event Boundary

The driver action service returns an internal transition result with action, previous state, next state, actor, driver, booking, and leg IDs. Future push/realtime/GPS integrations should react from this lifecycle boundary.

GPS, realtime location, push notifications, and chat are not implemented in this phase.
