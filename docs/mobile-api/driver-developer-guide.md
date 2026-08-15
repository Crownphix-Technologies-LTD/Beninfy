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
- `GET /driver/trips`
- `GET /driver/trips/:bookingLegId`
- `POST /driver/trips/:bookingLegId/actions`

## Identity Rule

Never send `driverId` as identity.

The backend derives the driver from:

```text
Authorization: Bearer <accessToken>
```

If a driver user is not linked to an operational `Driver` record, the API returns `DRIVER_NOT_LINKED`.

## Trip Actions

Allowed current actions:

- `accept`
- `dispatch`
- `complete`
- `cancel`

The backend decides whether each transition is valid. The app must handle standardized error codes such as `INVALID_TRANSITION`, `TRIP_NOT_FOUND`, `TRIP_NOT_ASSIGNED`, `DRIVER_INACTIVE`, and `VEHICLE_NOT_ASSIGNED`.

## Not Yet Available

- GPS/live tracking
- Realtime trip updates
- Push notifications
- In-app chat
- Driver earnings
- Richer trip lifecycle beyond the current minimal actions

Prisma models are not API contracts. Use the DTOs and docs in this directory as the source of truth.
