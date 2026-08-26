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
- `POST /auth/logout-all`
- `GET /driver/home`
- `GET /driver/profile`
- `POST /driver/change-password`
- `PATCH /driver/availability`
- `GET /driver/trips?view=all|upcoming|active|completed`
- `GET /driver/trip-history`
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
- `off_duty`: driver can authenticate and use the app, is not eligible for new assignment, and may continue executing valid lifecycle actions on trips already assigned to them.
- `inactive`: operations/admin-disabled account. Driver cannot self-reactivate.

Flutter can only request `available` or `off_duty`:

```text
PATCH /api/mobile/v1/driver/availability
```

```json
{ "status": "off_duty" }
```

Changing to `off_duty` does not release existing assignments, clear `driverId`, cancel trips, reset lifecycle state, or remove assigned trips from Driver Home/trip lists. Existing assigned trips remain executable through the normal authoritative `allowedActions` rules.

Presence is separate. Continue using `/driver/presence` for online/offline heartbeat state.

Dashboard flow:

1. App opens.
2. `GET /driver/home`.
3. Display `home.driver.dutyStatus`, `home.driver.presence.status`, `home.notificationUnreadCount`, and `home.featuredTrip`.
4. Toggle duty with `PATCH /driver/availability`.
5. Load `GET /driver/trips?view=active`.
6. Load `GET /driver/trips?view=upcoming`.
7. Current completed assigned trips use `GET /driver/trips?view=completed`.
8. Assignment history uses `GET /driver/trip-history`.

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

## Assignment History

Implemented:

`GET /api/mobile/v1/driver/trip-history?limit=20&cursor=...`

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
      "outcome": "reassigned",
      "outcomeLabelKey": "driverAssignmentHistory.reassigned",
      "effectiveOutcomeAt": "2026-08-18T08:20:00.000Z",
      "currentLegStatus": "assigned",
      "assignedAt": "2026-08-18T08:00:00.000Z",
      "acceptedAt": null,
      "declinedAt": null,
      "releasedAt": "2026-08-18T08:20:00.000Z",
      "completedAt": null,
      "releaseReason": "reassigned",
      "releaseSource": "admin"
    }
  ],
  "pageInfo": {
    "hasMore": false,
    "nextCursor": null,
    "limit": 20
  }
}
```

Supported outcomes:

- `current`
- `completed`
- `declined`
- `released`
- `reassigned`

Ordering is server-authoritative: `effectiveOutcomeAt DESC`, then `assignmentHistoryId DESC` for ties. `effectiveOutcomeAt` is the timestamp Flutter should use for the history row date and cursor-driven ordering. `assignedAt` remains assignment metadata.

Timestamp precedence is:

- `completed`: `completedAt`
- `declined`: `declinedAt`
- `reassigned`: `supersededAt`
- `released`: `releasedAt`
- `current`: `assignedAt`

Flutter should render these as assignment outcomes. A `released` or `reassigned` record means this driver's assignment ended; it does not necessarily mean the customer trip was cancelled. Flutter must pass `pageInfo.nextCursor` back unchanged and must not infer outcomes or ordering from raw timestamp fields.

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

## Passenger Manifest

Driver trip detail includes a privacy-filtered operational manifest:

```json
{
  "passengers": 2,
  "travelers": [
    { "sequence": 1, "fullName": "Ada Passenger", "isLead": true },
    { "sequence": 2, "fullName": "Second Passenger", "isLead": false }
  ],
  "passengerManifest": {
    "totalPassengers": 2,
    "entries": [
      { "sequence": 1, "fullName": "Ada Passenger", "isLead": true },
      { "sequence": 2, "fullName": "Second Passenger", "isLead": false }
    ]
  }
}
```

The driver manifest intentionally excludes passenger email addresses, passport numbers, nationality fields, payment details, coupon metadata, provider references, and internal admin notes. The summary-level `passengerPhone` remains the lead contact already approved for operational calling.

## Driver Security

Authenticated password change is implemented at:

```text
POST /api/mobile/v1/driver/change-password
```

Request:

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-strong-password",
  "device": {
    "deviceId": "ios-device-id",
    "platform": "ios"
  }
}
```

Success revokes previous mobile sessions, creates a replacement Driver session for the current device, and returns `driver`, `accessToken`, `refreshToken`, `tokenType`, and `expiresIn`. Errors include `CURRENT_PASSWORD_INVALID`, `PASSWORD_INVALID`, `DRIVER_NOT_LINKED`, and `DRIVER_INACTIVE`.

## Offline Behavior

Flutter may cache read-only Driver Home, trip summaries, trip detail, assignment history, notification list, and support config for display while offline. Cached records must be marked visually stale by the app and refreshed when connectivity returns.

Driver lifecycle actions, location publishing, chat sending, notification read receipts, duty changes, and password changes require a live backend response. Flutter must not replay stale cached lifecycle actions or locally mark a trip progressed without the authoritative API response.

## Not Yet Available

- Driver earnings
- Driver document upload/download contracts

Prisma models are not API contracts. Use the DTOs and docs in this directory as the source of truth.
