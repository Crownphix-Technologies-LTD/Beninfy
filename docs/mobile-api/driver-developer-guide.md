# Driver Developer Guide

Current driver mobile API base:

```text
/api/mobile/v1
```

## Implemented Endpoints

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /driver/profile`
- `PATCH /driver/availability`
- `GET /driver/trips?view=all|upcoming|active|completed`
- `GET /driver/trips/:bookingLegId`
- `POST /driver/trips/:bookingLegId/actions`
- `POST /driver/presence`
- `GET /driver/tracking`
- `POST /driver/trips/:bookingLegId/location`

## Identity Rule

Never send `driverId` as identity.

The backend derives the driver from:

```text
Authorization: Bearer <accessToken>
```

If a driver user is not linked to an operational `Driver` record, the API returns `DRIVER_NOT_LINKED`.

If a linked driver is `inactive`, driver APIs return `DRIVER_INACTIVE`. `off_duty` drivers can still authenticate and use the app so they can return to `available`.

## Duty Status

Duty status is persistent operations availability:

- `available`
- `off_duty`
- `inactive`

Flutter can only request `available` or `off_duty`:

```text
PATCH /api/mobile/v1/driver/availability
```

```json
{ "status": "off_duty" }
```

If the driver has an active trip, `off_duty` is rejected with `ACTIVE_TRIP_PREVENTS_OFF_DUTY`.

Presence is separate. Continue using `/driver/presence` for online/offline heartbeat state.

Dashboard flow:

1. App opens.
2. `GET /driver/profile`.
3. Display `driver.dutyStatus` and `driver.presence.status` separately.
4. Toggle duty with `PATCH /driver/availability`.
5. Load `GET /driver/trips?view=active`.
6. Load `GET /driver/trips?view=upcoming`.
7. History uses `GET /driver/trips?view=completed`.

## Trip Actions

Allowed current actions:

- `accept`
- `dispatch`
- `complete`
- `cancel`

The backend decides whether each transition is valid. The app must handle standardized error codes such as `INVALID_TRANSITION`, `TRIP_NOT_FOUND`, `TRIP_NOT_ASSIGNED`, `DRIVER_INACTIVE`, and `VEHICLE_NOT_ASSIGNED`.

## Not Yet Available

- Driver earnings

Prisma models are not API contracts. Use the DTOs and docs in this directory as the source of truth.
