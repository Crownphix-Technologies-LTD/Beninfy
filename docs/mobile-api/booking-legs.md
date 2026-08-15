# Booking Legs Contract

`BookingLeg` is the operational journey unit.

It is where Beninfy assigns:

- Driver
- Fleet vehicle
- Departure date
- Direction
- Operational status

Current statuses:

- `payment_pending`: Booking exists, but payment has not confirmed fleet reservation.
- `reserved`: Payment succeeded and the fleet reservation is active.
- `unassigned`: Operational leg exists but needs assignment.
- `assigned`: Driver or fleet assignment has been made.
- `dispatched`: Vehicle/driver has been dispatched.
- `driver_en_route`: Driver is on the way to pickup.
- `driver_arrived`: Driver has arrived at pickup.
- `passenger_onboard`: Passenger has boarded.
- `in_progress`: Trip is underway.
- `completed`: Leg is finished.
- `cancelled`: Leg is cancelled and should not block availability.

Do not add driver app actions by letting Flutter write `status` directly. Use server-side transition commands.

The backend validates the authenticated driver, assignment, current status, transition rules, and audit log.

Phase 3 implements the production action endpoint:

```text
POST /api/mobile/v1/driver/trips/:bookingLegId/actions
```

Body:

```json
{ "action": "dispatch" }
```

Allowed actions are `accept`, `decline`, `start_en_route`, `dispatch`, `arrive`, `passenger_onboard`, `start_trip`, `complete`, and `cancel`.

See `trip-lifecycle.md` for the full transition matrix.

## Driver Mobile Views

Driver trip tabs are backend-classified by `BookingLeg.status`.

Upcoming:

- `assigned`

Active:

- `dispatched`
- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`

Completed/history:

- `completed`

`unassigned`, `reserved`, and `payment_pending` do not appear in a driver's assigned trip views. Decline/cancel actions release the driver assignment by clearing `driverId`, so the released leg disappears from the current driver's upcoming/active lists.

Driver trip responses continue to include authoritative `allowedActions`.
