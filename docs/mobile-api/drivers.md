# Driver Mobile API

Current status: MOBILE MISSING.

The existing `Driver` model is an operational record, not an authenticated mobile account.

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

Do not run the migration against production until staging data and driver onboarding rules are agreed.

## Planned Endpoints

| Endpoint                                                  | Status      | Notes                                                  |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| `GET /api/mobile/v1/driver/profile`                       | IMPLEMENTED | Derived from authenticated driver principal.           |
| `GET /api/mobile/v1/driver/trips`                         | IMPLEMENTED | Assigned `BookingLeg` records only.                    |
| `GET /api/mobile/v1/driver/trips/:bookingLegId`           | IMPLEMENTED | Own assigned leg only.                                 |
| `POST /api/mobile/v1/driver/trips/:bookingLegId/actions`  | IMPLEMENTED | Production server-authoritative lifecycle transitions. |
| `POST /api/mobile/v1/driver/presence`                     | IMPLEMENTED | Realtime online/offline presence snapshot.             |
| `GET /api/mobile/v1/driver/tracking`                      | IMPLEMENTED | Driver tracking eligibility snapshot.                  |
| `POST /api/mobile/v1/driver/trips/:bookingLegId/location` | IMPLEMENTED | Trip-scoped latest location publishing.                |

Driver requests must never succeed simply because the client supplied a `driverId`.

Implemented actions are documented in `trip-lifecycle.md`. Driver `decline` and `cancel` release the driver assignment and return the leg to operations; they do not cancel the customer booking.

Tracking and presence are documented in `tracking.md` and `realtime.md`.
