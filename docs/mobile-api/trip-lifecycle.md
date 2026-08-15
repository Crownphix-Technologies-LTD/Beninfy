# Trip Lifecycle

Current `BookingLeg.status` is enough for admin assignment and availability, but not rich enough for the full driver app lifecycle.

Future driver actions:

- Accept trip
- Decline trip
- En route
- Arrived
- Passenger picked up
- Start trip
- Complete trip
- Cancel
- Report incident

## Recommendation

Keep `BookingLeg.status` as the coarse operational state and introduce a separate event/state-machine layer for driver actions.

Recommended future models:

```text
BookingLeg
└── TripEvent[]
```

or:

```text
BookingLeg
└── DriverTripState
```

Reasoning:

- Avoids overloading one string field with every driver micro-state.
- Preserves current availability logic.
- Allows auditability and timestamps for each action.
- Allows incident/cancellation metadata without leaking admin notes.
- Lets customer tracking show a friendly derived status.

Phase 1 does not implement this. It documents the boundary so Flutter developers do not invent transitions locally.
