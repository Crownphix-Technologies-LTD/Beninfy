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

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /api/mobile/v1/driver/profile` | IMPLEMENTED | Derived from authenticated driver principal. |
| `GET /api/mobile/v1/driver/trips` | IMPLEMENTED | Assigned `BookingLeg` records only. |
| `GET /api/mobile/v1/driver/trips/:bookingLegId` | IMPLEMENTED | Own assigned leg only. |
| `POST /api/mobile/v1/driver/trips/:bookingLegId/actions` | IMPLEMENTED | Minimal server-authoritative lifecycle transitions. |
| `POST /api/mobile/v1/driver/location` | PLANNED | Not in Phase 2. |

Driver requests must never succeed simply because the client supplied a `driverId`.

Implemented actions:

- `accept`: `reserved` or `unassigned` -> `assigned`
- `dispatch`: `assigned` -> `dispatched`, requires assigned fleet vehicle
- `complete`: `dispatched` -> `completed`, requires assigned fleet vehicle
- `cancel`: `reserved`, `unassigned`, `assigned`, or `dispatched` -> `cancelled`
