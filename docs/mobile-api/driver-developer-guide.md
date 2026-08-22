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
- `GET /driver/home`
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

- `available`: driver is eligible for operations assignment and may execute assigned trip actions.
- `off_duty`: driver can authenticate and use the app, but is not eligible for new assignment and cannot execute active trip lifecycle actions until returning to `available`.
- `inactive`: operations/admin-disabled account. Driver cannot self-reactivate.

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
2. `GET /driver/home`.
3. Display `home.driver.dutyStatus`, `home.driver.presence.status`, `home.notificationUnreadCount`, and `home.featuredTrip`.
4. Toggle duty with `PATCH /driver/availability`.
5. Load `GET /driver/trips?view=active`.
6. Load `GET /driver/trips?view=upcoming`.
7. History uses `GET /driver/trips?view=completed`.

`GET /driver/profile` remains available for profile refresh. Driver profile includes `image` and `avatarUrl` when the linked user account has an image.

## Driver Home

Implemented:

`GET /api/mobile/v1/driver/home`

Response:

```json
{
  "home": {
    "driver": {
      "id": "driver-id",
      "name": "Ada Driver",
      "phone": "+22951019134",
      "email": "driver@example.com",
      "image": "https://...",
      "avatarUrl": "https://...",
      "status": "available",
      "dutyStatus": "available",
      "presence": {
        "status": "online",
        "lastSeenAt": "2026-08-15T12:00:00.000Z",
        "lastHeartbeatAt": "2026-08-15T12:00:00.000Z",
        "currentBookingLegId": "leg-id"
      }
    },
    "notificationUnreadCount": 2,
    "currentActiveTrip": null,
    "featuredTrip": null,
    "support": {
      "email": "support@beninfy.com",
      "phone": null,
      "whatsapp": null,
      "emergency": {
        "enabled": false,
        "phone": null,
        "whatsapp": null
      }
    }
  }
}
```

`currentActiveTrip` is the first assigned driver leg in an active operational state. `featuredTrip` is `currentActiveTrip` when present, otherwise the next upcoming assigned trip. This avoids forcing Flutter Home to infer state from multiple list calls.

## Trip Actions

Allowed current actions:

- `accept`
- `decline`
- `start_en_route`
- `dispatch`
- `arrive`
- `passenger_onboard`
- `start_trip`
- `complete`
- `cancel`

The backend decides whether each transition is valid. The app must handle standardized error codes such as `INVALID_TRANSITION`, `TRIP_NOT_FOUND`, `TRIP_NOT_ASSIGNED`, `DRIVER_INACTIVE`, and `VEHICLE_NOT_ASSIGNED`.

## Navigation To Pickup

Driver trip summary and detail DTOs include:

```json
{
  "pickupAddress": "Mainland",
  "pickupCoordinates": { "latitude": 6.5244, "longitude": 3.3792 },
  "dropoffAddress": "Cotonou",
  "dropoffCoordinates": { "latitude": 6.3703, "longitude": 2.3912 }
}
```

Flutter should hand off pickup/dropoff coordinates to the platform navigation app or maps SDK. Do not derive ETA, polyline, or route pricing locally. Backend journey intelligence is optional and remains server-authoritative when exposed.

## Not Yet Available

- Driver earnings

Prisma models are not API contracts. Use the DTOs and docs in this directory as the source of truth.
