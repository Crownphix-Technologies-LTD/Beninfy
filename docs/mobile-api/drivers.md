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

| Endpoint                                                  | Status      | Notes                                                  |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| `GET /api/mobile/v1/driver/profile`                       | IMPLEMENTED | Derived from authenticated driver principal.           |
| `PATCH /api/mobile/v1/driver/availability`                | IMPLEMENTED | Driver-controlled persistent duty status.              |
| `GET /api/mobile/v1/driver/trips?view=...`                | IMPLEMENTED | Assigned `BookingLeg` records with mobile views.       |
| `GET /api/mobile/v1/driver/trips/:bookingLegId`           | IMPLEMENTED | Own assigned leg only.                                 |
| `POST /api/mobile/v1/driver/trips/:bookingLegId/actions`  | IMPLEMENTED | Production server-authoritative lifecycle transitions. |
| `POST /api/mobile/v1/driver/presence`                     | IMPLEMENTED | Realtime online/offline presence snapshot.             |
| `GET /api/mobile/v1/driver/tracking`                      | IMPLEMENTED | Driver tracking eligibility snapshot.                  |
| `POST /api/mobile/v1/driver/trips/:bookingLegId/location` | IMPLEMENTED | Trip-scoped latest location publishing.                |

## Persistent Duty Status

`Driver.status` is the persistent operations duty state:

- `available`: driver is eligible for new assignments and can execute assigned trips.
- `off_duty`: driver is active but not eligible for new assignments.
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

If a driver currently has an active operational trip, setting `off_duty` returns `ACTIVE_TRIP_PREVENTS_OFF_DUTY`.

Active operational states for this rule are:

- `dispatched`
- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`

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

Released/declined/cancelled assignments are not retained in the current driver's personal history because the leg is returned to operations and `driverId` is cleared.

Sorting:

- upcoming: earliest departure first
- active: earliest/current operational trip first
- completed: newest completed first, then newest departure

Pagination remains cursor based with `limit` and `cursor`. Cursor values are scoped to the selected `view`.

Implemented actions are documented in `trip-lifecycle.md`. Driver `decline` and `cancel` release the driver assignment and return the leg to operations; they do not cancel the customer booking.

Tracking and presence are documented in `tracking.md` and `realtime.md`.
