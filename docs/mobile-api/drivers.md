# Driver Mobile API

Current status: IMPLEMENTED.

The existing `Driver` model is an operational record linked to an authenticated mobile `User`.

## Recommended Identity Relationship

Additive Prisma changes now prepare a relation between `User` and `Driver`.

Recommended direction:

```text
User
└── Driver?
```

Use `User` as the authentication principal because roles, password security, session revocation, admin management, and audit behavior already exist there. A unique nullable relation from `Driver` to `User` has been prepared.

Conceptual schema change:

```prisma
model Driver {
  userId String? @unique
  user   User?   @relation(fields: [userId], references: [id])
}
```

This relationship is implemented by the mobile auth foundation. Driver requests must never succeed simply because the client supplied a `driverId`.

## Implemented Endpoints

| Endpoint                                                  | Status      | Notes                                                   |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------- |
| `GET /api/mobile/v1/driver/profile`                       | IMPLEMENTED | Derived from authenticated driver principal.            |
| `PATCH /api/mobile/v1/driver/availability`                | IMPLEMENTED | Driver-controlled persistent duty status.               |
| `GET /api/mobile/v1/driver/trips?view=...`                | IMPLEMENTED | Assigned `BookingLeg` records with mobile views.        |
| `GET /api/mobile/v1/driver/trip-history`                  | IMPLEMENTED | Assignment history ledger for the authenticated driver. |
| `GET /api/mobile/v1/driver/trips/:bookingLegId`           | IMPLEMENTED | Own assigned leg only.                                  |
| `POST /api/mobile/v1/driver/trips/:bookingLegId/actions`  | IMPLEMENTED | Production server-authoritative lifecycle transitions.  |
| `POST /api/mobile/v1/driver/presence`                     | IMPLEMENTED | Realtime online/offline presence snapshot.              |
| `GET /api/mobile/v1/driver/tracking`                      | IMPLEMENTED | Driver tracking eligibility snapshot.                   |
| `POST /api/mobile/v1/driver/trips/:bookingLegId/location` | IMPLEMENTED | Trip-scoped latest location publishing.                 |

## Persistent Duty Status

`Driver.status` is the persistent operations duty state:

- `available`: driver is eligible for new assignments and can execute assigned trips.
- `off_duty`: driver is active, not eligible for new assignments, and can continue executing trips already assigned to them.
- `inactive`: admin/operations disabled state. Driver cannot self-reactivate.

The driver app may only set:

```json
{ "status": "available" }
```

or:

```json
{ "status": "off_duty" }
```

Drivers cannot set `inactive`.

Setting `off_duty` does not release current assignments, cancel trips, clear `driverId`, reset lifecycle state, or hide assigned trips. It only removes the driver from new-assignment eligibility.

## Presence Is Separate

Realtime presence is not duty status.

Examples:

- App open: presence may be `online`; duty may still be `off_duty`.
- Driver selects available: duty becomes `available`; presence is unchanged.
- App closes briefly: presence may become stale/offline; duty remains `available`.

The backend does not automatically switch duty status when realtime presence changes.

Driver profile exposes both:

```json
{
  "status": "available",
  "dutyStatus": "available",
  "presence": {
    "status": "online",
    "lastSeenAt": "2026-08-15T12:00:00.000Z",
    "lastHeartbeatAt": "2026-08-15T12:00:00.000Z",
    "currentBookingLegId": null
  }
}
```

`status` remains as a backwards-compatible alias for duty status.

## Trip Views

`GET /api/mobile/v1/driver/trips` supports:

- `view=all`
- `view=upcoming`
- `view=active`
- `view=completed`

Default is `all` for compatibility.

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

`GET /driver/trips` remains a current-assignment/current-trip view. It is scoped to the current `BookingLeg.driverId`.

Sorting:

- upcoming: earliest departure first
- active: earliest/current operational trip first
- completed: newest completed first, then newest departure

Pagination remains cursor based with `limit` and `cursor`. Cursor values are scoped to the selected `view`.

## Assignment History

`GET /api/mobile/v1/driver/trip-history`

This endpoint reads `DriverTripAssignmentHistory`, an append-only assignment ledger. It returns only records for the authenticated driver. Flutter must not send `driverId`.

Query params:

- `limit`: optional, default `20`, max `50`
- `cursor`: optional, from `pageInfo.nextCursor`

Response:

```json
{
  "history": [
    {
      "assignmentHistoryId": "history-id",
      "bookingLegId": "leg-id",
      "bookingId": "booking-id",
      "reference": "booking-id",
      "routeDisplayName": "Lagos to Cotonou",
      "direction": "outbound",
      "from": "Lagos",
      "to": "Cotonou",
      "departureDate": "2026-08-18T09:00:00.000Z",
      "outcome": "declined",
      "outcomeLabelKey": "driverAssignmentHistory.declined",
      "effectiveOutcomeAt": "2026-08-18T08:05:00.000Z",
      "currentLegStatus": "unassigned",
      "assignedAt": "2026-08-18T08:00:00.000Z",
      "acceptedAt": null,
      "declinedAt": "2026-08-18T08:05:00.000Z",
      "releasedAt": "2026-08-18T08:05:00.000Z",
      "completedAt": null,
      "releaseReason": "driver_declined",
      "releaseSource": "driver"
    }
  ],
  "pageInfo": {
    "hasMore": false,
    "nextCursor": null,
    "limit": 20
  }
}
```

Outcomes:

- `current`: the assignment is still open in the ledger.
- `completed`: the driver's assignment reached trip completion.
- `declined`: the driver declined the assignment.
- `released`: the driver or operations released the assignment without assigning a replacement in the same operation.
- `reassigned`: operations moved the leg away from this driver to another driver.

Ordering is server-authoritative: `effectiveOutcomeAt DESC`, with `assignmentHistoryId DESC` as the stable tie-breaker. Cursor values are opaque; Flutter should only send back the latest `pageInfo.nextCursor`.

`effectiveOutcomeAt` is the display/order timestamp for the assignment outcome:

- `completed` uses `completedAt`
- `declined` uses `declinedAt`
- `reassigned` uses `supersededAt`
- `released` uses `releasedAt`
- `current` uses `assignedAt`

Driver decline/release may clear current `BookingLeg.driverId` and return the leg to operations as `unassigned`. That does not necessarily mean the customer booking or `BookingLeg` was globally cancelled. Flutter should display the assignment outcome, not infer trip cancellation.

Complete historical coverage begins from migration `20260818140000_driver_assignment_history`. The migration backfills only currently assigned driver/leg pairs because previously released drivers cannot be proven from the current `BookingLeg.driverId` alone.

Implemented actions are documented in `trip-lifecycle.md`. Driver `decline` and `cancel` release the driver assignment and return the leg to operations; they do not cancel the customer booking.

Tracking and presence are documented in `tracking.md` and `realtime.md`.
