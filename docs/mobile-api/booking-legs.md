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
- `completed`: Leg is finished.
- `cancelled`: Leg is cancelled and should not block availability.

Do not add driver app actions by letting Flutter write `status` directly. Use server-side transition commands.

Recommended future shape:

```json
{
  "action": "ACCEPT_TRIP"
}
```

The backend validates the authenticated driver, assignment, current status, transition rules, and audit log.

Phase 2 implemented the first action endpoint:

```text
POST /api/mobile/v1/driver/trips/:bookingLegId/actions
```

Body:

```json
{ "action": "dispatch" }
```

Allowed actions are currently `accept`, `dispatch`, `complete`, and `cancel`.
