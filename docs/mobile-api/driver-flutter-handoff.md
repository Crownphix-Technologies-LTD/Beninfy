# Beninfy Driver Flutter Handoff

This document is the source-backed contract for the Beninfy Driver Flutter app. It reflects the current backend branch `feature/mobile-production-completion`.

Base path:

```text
/api/mobile/v1
```

All authenticated Driver endpoints use:

```http
Authorization: Bearer <accessToken>
```

Flutter must never send authoritative `driverId`, `userId`, trip ownership, payment state, trip status, or `allowedActions`. The backend derives those from the mobile token and database state.

## Capability Matrix

| Capability | Backend status | Provider dependency | Mobile API | Flutter-ready | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Driver login | FULLY WIRED | None beyond DB/auth secret | `POST /auth/login` | Yes | Needs linked active driver user |
| Token refresh/logout | FULLY WIRED | None beyond DB/auth secret | `/auth/refresh`, `/auth/logout`, `/auth/logout-all` | Yes | None |
| Driver profile | FULLY WIRED | None | `GET /driver/profile` | Yes | None |
| Duty status | FULLY WIRED | None | `PATCH /driver/availability` | Yes | Drivers cannot self-set `inactive` |
| Presence | FULLY WIRED | Realtime token secret; Supabase client presence in Flutter | `POST /driver/presence` | Yes | Flutter must join presence channel |
| Trip lists | FULLY WIRED | None | `GET /driver/trips?view=...` | Yes | Needs assigned trips |
| Trip detail | FULLY WIRED | None | `GET /driver/trips/:bookingLegId` | Yes | None |
| Lifecycle actions | FULLY WIRED | None | `POST /driver/trips/:bookingLegId/actions` | Yes | Booking must be confirmed |
| Decline/release | FULLY WIRED | None | same actions endpoint | Yes | Reassignment remains operations responsibility |
| Location publishing | FULLY WIRED | Supabase Broadcast optional | `POST /driver/trips/:bookingLegId/location` | Yes | Requires active lifecycle state |
| Journey intelligence | PROVIDER-CONFIG REQUIRED | `GOOGLE_ROUTES_API_KEY` | tracking DTO | Yes, null-safe | Optional ETA/polyline only |
| Supabase Broadcast | PROVIDER-CONFIG REQUIRED | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | tracking/chat realtime metadata | Yes, REST fallback works | Configure provider for realtime |
| Supabase Presence | PARTIAL | Flutter must use Supabase Presence with backend token metadata | `POST /driver/presence` | Yes | Backend persists presence snapshot; provider join is client-side |
| Chat | FULLY WIRED | Supabase Broadcast optional | `/trips/:bookingLegId/chat*` | Yes | Chat send only during active assigned lifecycle |
| Push notifications | PROVIDER-CONFIG REQUIRED | `PUSH_PROVIDER=fcm`, Firebase env | `/devices/push-token`, `/notifications` | Yes | Provider setup needed for external push |
| Support config | FULLY WIRED | Support env names | `GET /config/support` | Yes | Configure channels |
| Driver history | FULLY WIRED for completed assigned legs | None | `GET /driver/trips?view=completed` | Yes | Declined/released assignments are not retained as driver history |
| Incident reporting | MISSING | N/A | None | No | Future approved scope |
| Earnings/payouts | NOT REQUIRED | N/A | None | No | Out of current scope |

## Auth

### `POST /api/mobile/v1/auth/login`

Auth: public.

Request:

```json
{
  "email": "driver@example.com",
  "password": "password",
  "principalType": "DRIVER",
  "device": {
    "deviceId": "optional-device-id",
    "platform": "ios|android",
    "deviceName": "optional",
    "appVersion": "optional"
  }
}
```

`principalType` may be omitted for a user whose role is `driver`; Flutter should send `"DRIVER"` for clarity.

Success:

```json
{
  "principalType": "DRIVER",
  "user": {
    "id": "driverId",
    "name": "Driver Name",
    "phone": "+229...",
    "email": "driver@example.com",
    "status": "available|off_duty|inactive",
    "dutyStatus": "available|off_duty|inactive",
    "presence": null
  },
  "onboarding": null,
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

Behavior:

- Active linked drivers can authenticate.
- `off_duty` drivers can authenticate.
- `inactive` drivers are blocked.
- Admin users are blocked.
- Customer onboarding never applies to Driver login.
- Access token TTL defaults to 15 minutes.
- Refresh token TTL defaults to 30 days and rotates on refresh.

Common errors:

- `401 INVALID_CREDENTIALS`
- `403 DRIVER_NOT_LINKED`
- `403 DRIVER_INACTIVE`
- `403 ACCOUNT_DISABLED`
- `403 FORBIDDEN`
- `429 RATE_LIMITED`

### `POST /api/mobile/v1/auth/refresh`

Auth: public with refresh token in JSON.

Request:

```json
{ "refreshToken": "..." }
```

Success returns rotated `accessToken`, rotated `refreshToken`, `tokenType`, `expiresIn`.

### `POST /api/mobile/v1/auth/logout`

Auth: public with refresh token in JSON.

Request:

```json
{ "refreshToken": "..." }
```

Success:

```json
{ "ok": true }
```

### `GET /api/mobile/v1/auth/me`

Auth: Driver bearer token.

Success for Driver:

```json
{
  "principalType": "DRIVER",
  "user": "<DriverProfileDto>",
  "onboarding": null
}
```

## Profile

### `GET /api/mobile/v1/driver/profile`

Auth: Driver bearer token.

Success:

```json
{
  "driver": {
    "id": "driverId",
    "name": "Driver Name",
    "phone": "+229...",
    "email": "driver@example.com",
    "status": "available|off_duty|inactive",
    "dutyStatus": "available|off_duty|inactive",
    "presence": {
      "status": "online|offline",
      "lastSeenAt": "ISO date",
      "lastHeartbeatAt": "ISO date or null",
      "currentBookingLegId": "bookingLegId or null"
    }
  }
}
```

No password hashes, payment data, admin notes, maintenance notes, or fake profile-photo fields are returned.

## Duty

### `PATCH /api/mobile/v1/driver/availability`

Auth: Driver bearer token.

Request:

```json
{ "status": "available|off_duty" }
```

Success:

```json
{ "driver": "<DriverProfileDto>" }
```

Rules:

- Driver can self-set only `available` or `off_duty`.
- `inactive` is an operations/admin-controlled state.
- Inactive drivers cannot authenticate or update availability.
- Driver cannot go `off_duty` while assigned to an active trip.
- Presence does not mutate duty status.

Errors:

- `400 INVALID_DRIVER_STATUS`
- `403 DRIVER_NOT_LINKED`
- `403 DRIVER_INACTIVE`
- `409 ACTIVE_TRIP_PREVENTS_OFF_DUTY`

## Presence

### `POST /api/mobile/v1/driver/presence`

Auth: Driver bearer token.

Request:

```json
{
  "status": "online|offline",
  "currentBookingLegId": "optional booking leg id"
}
```

Success:

```json
{
  "presence": {
    "status": "online|offline",
    "lastSeenAt": "ISO date",
    "lastHeartbeatAt": "ISO date or null",
    "currentBookingLegId": "bookingLegId or null",
    "realtime": {
      "token": "signed presence token",
      "expiresAt": "ISO date",
      "channel": "driver:<driverId>:presence",
      "provider": "supabase-presence",
      "permission": "presence"
    }
  }
}
```

The backend persists the latest presence snapshot. Flutter is responsible for joining Supabase Presence if realtime presence is enabled. Connection loss must not change Driver duty status.

## Trip Lists

### `GET /api/mobile/v1/driver/trips?view=all|upcoming|active|completed&limit=20&cursor=<id>`

Auth: Driver bearer token.

Views:

- `all`: all assigned legs
- `upcoming`: `assigned`
- `active`: `dispatched`, `driver_en_route`, `driver_arrived`, `passenger_onboard`, `in_progress`
- `completed`: `completed`

Success:

```json
{
  "view": "all|upcoming|active|completed",
  "trips": ["<DriverTripSummaryDto>"],
  "pageInfo": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

`DriverTripSummaryDto`:

```json
{
  "legId": "bookingLegId",
  "bookingId": "bookingId",
  "reference": "BFY-XXXXXXXX",
  "view": "upcoming|active|completed|all",
  "routeDisplayName": "Lagos to Cotonou",
  "direction": "outbound|return",
  "from": "Lagos",
  "to": "Cotonou",
  "departureDate": "ISO date",
  "status": "assigned|driver_en_route|driver_arrived|passenger_onboard|in_progress|completed|cancelled|...",
  "driverStatus": "assigned|en_route_to_pickup|at_pickup|passenger_onboard|in_progress|completed|cancelled|awaiting_assignment",
  "allowedActions": ["accept", "start_en_route", "cancel"],
  "passengerName": "Name or null",
  "passengerPhone": "Phone or null",
  "pickupAddress": "Address or null",
  "dropoffAddress": "Address or null",
  "vehicle": {
    "id": "fleetVehicleId",
    "label": "Toyota Camry",
    "plateNumber": "ABC-123",
    "color": "Black or null",
    "vehicleCategoryId": "saloon",
    "status": "available|maintenance|inactive"
  }
}
```

Ownership: returns only legs assigned to the authenticated driver.

## Trip Detail

### `GET /api/mobile/v1/driver/trips/:bookingLegId`

Auth: Driver bearer token.

Success:

```json
{
  "trip": {
    "...summaryFields": "same as DriverTripSummaryDto",
    "passengers": 2,
    "travelers": [],
    "specialRequirements": "Call on arrival or null",
    "timestamps": {
      "assignedAt": "ISO date or null",
      "acceptedAt": "ISO date or null",
      "declinedAt": "ISO date or null",
      "enRouteAt": "ISO date or null",
      "arrivedAt": "ISO date or null",
      "passengerOnboardAt": "ISO date or null",
      "startedAt": "ISO date or null",
      "completedAt": "ISO date or null",
      "cancelledAt": "ISO date or null"
    }
  }
}
```

No customer email, customer payment state, payment provider references, coupon data, or internal admin notes are returned.

## Lifecycle Actions

### `POST /api/mobile/v1/driver/trips/:bookingLegId/actions`

Auth: Driver bearer token.

Request:

```json
{
  "action": "accept|decline|start_en_route|dispatch|arrive|passenger_onboard|start_trip|complete|cancel",
  "reasonCode": "optional"
}
```

Success:

```json
{
  "ok": true,
  "bookingLegId": "bookingLegId",
  "previousStatus": "assigned",
  "status": "driver_en_route",
  "allowedActions": ["arrive", "cancel"],
  "idempotent": false
}
```

Authoritative transitions:

| Action | From | To | Notes |
| --- | --- | --- | --- |
| `accept` | `assigned` | `assigned` | Records accepted timestamp; idempotent after accept |
| `decline` | `assigned`, `driver_en_route` | `unassigned` | Releases driver; does not cancel customer booking |
| `start_en_route` | `assigned` | `driver_en_route` | Requires assigned fleet vehicle |
| `dispatch` | `assigned` | `driver_en_route` | Backward-compatible alias |
| `arrive` | `driver_en_route`, `dispatched` | `driver_arrived` | Idempotent once arrived |
| `passenger_onboard` | `driver_arrived` | `passenger_onboard` | Requires vehicle |
| `start_trip` | `passenger_onboard` | `in_progress` | Requires vehicle |
| `complete` | `in_progress` | `completed` | Booking completes only when every round-trip leg is completed |
| `cancel` | `assigned`, `driver_en_route`, `driver_arrived` | `unassigned` | Releases driver; does not cancel customer booking |

Rules:

- Booking must be `confirmed` or `completed` before actions.
- Driver must be assigned to the leg.
- Vehicle is required for movement actions.
- Atomic update guards reject stale transitions.
- Released assignments clear driver presence current trip and expire latest location.

Common errors:

- `403 TRIP_NOT_ASSIGNED`
- `402 PAYMENT_REQUIRED`
- `409 VEHICLE_NOT_ASSIGNED`
- `409 ACTION_NOT_ALLOWED`
- `409 INVALID_TRANSITION`
- `409 TRIP_ALREADY_COMPLETED`
- `409 TRIP_TERMINAL`

## Location And Tracking

### `GET /api/mobile/v1/driver/tracking`

Auth: Driver bearer token.

Returns up to five active tracking snapshots for the authenticated driver.

Success:

```json
{
  "tracking": ["<TrackingSnapshotDto>"]
}
```

### `POST /api/mobile/v1/driver/trips/:bookingLegId/location`

Auth: Driver bearer token.

Request:

```json
{
  "latitude": 6.5244,
  "longitude": 3.3792,
  "accuracyMeters": 20,
  "headingDegrees": 180,
  "speedMetersPerSecond": 12.5,
  "capturedAt": "ISO date",
  "sequence": 123
}
```

Success:

```json
{
  "ok": true,
  "bookingLegId": "bookingLegId",
  "trackingStatus": "live",
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "accuracyMeters": 20,
    "headingDegrees": 180,
    "speedMetersPerSecond": 12.5,
    "sequence": 123,
    "capturedAt": "ISO date",
    "receivedAt": "ISO date",
    "expiresAt": "ISO date"
  },
  "realtimeEvent": {
    "event": "trip.location_updated",
    "version": 1,
    "bookingLegId": "bookingLegId",
    "latitude": 6.5244,
    "longitude": 3.3792,
    "accuracyMeters": 20,
    "recordedAt": "ISO date",
    "sequence": 123
  }
}
```

Gates:

- Only assigned driver can publish.
- Booking must be confirmed/completed.
- Leg status must be `driver_en_route`, `driver_arrived`, `passenger_onboard`, or `in_progress`.
- Stale, future, invalid, and out-of-order locations are rejected.
- Latest location persists even if Supabase Broadcast is disabled or fails.

## Realtime Tracking And Journey Intelligence

`TrackingSnapshotDto` includes:

```json
{
  "bookingId": "bookingId",
  "bookingLegId": "bookingLegId",
  "trackingStatus": "live|stale|unavailable|ended",
  "operationalStatus": "driver_en_route",
  "customerStatus": "driver_on_the_way",
  "driverStatus": "en_route_to_pickup",
  "locationFresh": true,
  "lastLocation": "<LocationDto or null>",
  "driver": { "id": "driverId", "name": "Driver", "phone": "+229..." },
  "vehicle": "<FleetVehicleDto or null>",
  "realtime": {
    "provider": "supabase-broadcast",
    "channel": "trip:<bookingLegId>:tracking",
    "token": "signed realtime token",
    "permission": "publish",
    "expiresAt": "ISO date",
    "events": ["trip.location_updated"]
  },
  "journeyIntelligence": {
    "routePolyline": "encoded polyline or null",
    "distanceRemainingMeters": 12000,
    "estimatedArrivalAt": "ISO date or null",
    "estimatedDurationSeconds": 1800,
    "calculatedAt": "ISO date",
    "freshness": "fresh|stale|unavailable"
  }
}
```

`journeyIntelligence` is nullable. If `GOOGLE_ROUTES_API_KEY` is absent or Google fails, the app must continue without ETA/polyline.

Flutter responsibility:

- Render the native Google Map.
- Use Driver Android/iOS Maps keys.
- Collect native GPS and call the location endpoint.
- Subscribe/publish to Supabase channels if configured.

Backend responsibility:

- Store latest location.
- Authorize trip-scoped realtime metadata.
- Call Google Routes for optional ETA/route intelligence.
- Never expose `GOOGLE_ROUTES_API_KEY` to Flutter.

## Chat

Shared Driver/Customer endpoints:

- `GET /api/mobile/v1/trips/:bookingLegId/chat`
- `GET /api/mobile/v1/trips/:bookingLegId/messages?limit=30&cursor=<messageId>`
- `POST /api/mobile/v1/trips/:bookingLegId/messages`
- `POST /api/mobile/v1/trips/:bookingLegId/messages/read`

Auth: Driver bearer token.

Send request:

```json
{
  "text": "I have arrived.",
  "clientMessageId": "optional-idempotency-key"
}
```

Send success:

```json
{
  "message": {
    "id": "messageId",
    "conversationId": "conversationId",
    "bookingLegId": "bookingLegId",
    "senderType": "driver",
    "senderDisplayName": "Driver Name",
    "messageType": "text",
    "text": "I have arrived.",
    "systemEventCode": null,
    "createdAt": "ISO date",
    "isOwnMessage": true
  },
  "realtime": {
    "channel": "trip:<bookingLegId>:chat",
    "event": {
      "event": "chat.message_created",
      "version": 1,
      "bookingLegId": "bookingLegId",
      "conversationId": "conversationId",
      "message": "<ChatMessageDto>"
    }
  }
}
```

Rules:

- Chat sends only in `assigned`, `driver_en_route`, `driver_arrived`, `passenger_onboard`, `in_progress`.
- Completed/cancelled chats are read-only.
- Reassignment creates driver-separated conversations.
- Message list is newest-first with cursor pagination.
- Realtime publish failure does not lose persisted messages.

## Notifications

### `POST /api/mobile/v1/devices/push-token`

Auth: Driver bearer token.

Request:

```json
{
  "token": "fcm-token",
  "platform": "android|ios",
  "appType": "driver",
  "deviceId": "optional",
  "deviceName": "optional",
  "appVersion": "optional",
  "language": "en|fr"
}
```

Success:

```json
{
  "device": {
    "id": "pushDeviceId",
    "appType": "driver",
    "platform": "android|ios",
    "deviceId": "optional or null",
    "language": "en|fr",
    "lastSeenAt": "ISO date",
    "revokedAt": null,
    "invalidatedAt": null
  }
}
```

`appType` must match the authenticated principal. Driver cannot register a customer token.

### `DELETE /api/mobile/v1/devices/push-token`

Request:

```json
{
  "appType": "driver",
  "token": "optional",
  "deviceId": "optional"
}
```

Success:

```json
{ "ok": true, "revoked": 1 }
```

### `GET /api/mobile/v1/notifications?limit=20&cursor=<id>&unread=true`

Auth: Driver bearer token.

Success:

```json
{
  "notifications": [
    {
      "id": "notificationId",
      "type": "trip.driver_assigned",
      "title": "Driver assigned",
      "body": "A Beninfy driver has been assigned to your trip.",
      "payload": {
        "type": "trip.driver_assigned",
        "version": 1,
        "bookingId": "bookingId",
        "bookingLegId": "bookingLegId"
      },
      "language": "en",
      "deliveryState": "pending|sent|failed|invalid_token|skipped|skipped_no_device",
      "readAt": null,
      "createdAt": "ISO date",
      "unread": true
    }
  ],
  "pageInfo": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

Driver app should route using `payload.type`, `payload.bookingId`, and `payload.bookingLegId`. Do not depend on screen names from the backend.

Driver-relevant event types currently include:

- `trip.driver_assigned`
- `trip.assignment_removed`
- `trip.assignment_changed`
- `trip.driver_en_route`
- `trip.driver_arrived`
- `trip.started`
- `trip.completed`
- `trip.cancelled`
- `chat.new_message`

FCM provider requires `PUSH_PROVIDER=fcm`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`. If provider config is absent, notifications remain persisted and delivery is marked skipped/failed according to provider state.

## Support

### `GET /api/mobile/v1/config/support`

Auth: public.

Success:

```json
{
  "support": {
    "email": "configured email or null",
    "phone": "configured phone or null",
    "whatsapp": {
      "display": "+229...",
      "url": "https://wa.me/229..."
    },
    "emergency": {
      "enabled": true,
      "phone": "configured phone or null",
      "whatsapp": "same whatsapp object or null"
    }
  }
}
```

Do not hardcode support contacts in Flutter.

## Provider Env Inventory

Names only:

| Variable | Driver relevance | Local status in `.env` | Production need |
| --- | --- | --- | --- |
| `DATABASE_URL` | DB | PRESENT | PRODUCTION REQUIRED |
| `DIRECT_URL` | migrations | PRESENT | PRODUCTION REQUIRED |
| `MOBILE_AUTH_SECRET` | mobile token signing | MISSING locally; `AUTH_SECRET` fallback present | PRODUCTION REQUIRED |
| `AUTH_SECRET` | fallback token secret | PRESENT | PRODUCTION REQUIRED |
| `REALTIME_AUTH_SECRET` | realtime/presence token signing | MISSING locally; auth fallback works | PRODUCTION REQUIRED |
| `SUPABASE_URL` | Broadcast/storage server URL | MISSING locally; `NEXT_PUBLIC_SUPABASE_URL` present | PRODUCTION REQUIRED for realtime/storage |
| `SUPABASE_SECRET_KEY` | Broadcast/storage server key | MISSING locally | PRODUCTION REQUIRED for realtime/storage |
| `GOOGLE_ROUTES_API_KEY` | ETA/polyline | MISSING locally | OPTIONAL but production recommended |
| `PUSH_PROVIDER` | push provider selection | MISSING locally | PRODUCTION REQUIRED for push |
| `FIREBASE_PROJECT_ID` | FCM | MISSING locally | PRODUCTION REQUIRED for push |
| `FIREBASE_CLIENT_EMAIL` | FCM | MISSING locally | PRODUCTION REQUIRED for push |
| `FIREBASE_PRIVATE_KEY` | FCM | MISSING locally | PRODUCTION REQUIRED for push |
| `WORKER_SECRET` / `CRON_SECRET` | worker auth | MISSING locally | PRODUCTION REQUIRED |
| `SMTP_*` | email notifications | PRESENT locally for listed SMTP names | PRODUCTION REQUIRED for email |
| `SUPPORT_EMAIL` | support config | MISSING locally; SMTP sender fallback exists | PRODUCTION REQUIRED |
| `SUPPORT_PHONE` | support config | MISSING locally | PRODUCTION REQUIRED |
| `SUPPORT_WHATSAPP` | support config | MISSING locally | PRODUCTION REQUIRED |

## Gap Classification

P0: none found for Driver Flutter implementation.

P1:

- Preview/staging provider envs must be configured for realtime push, Broadcast, Presence, and optional Google Routes.
- Staging must contain linked driver accounts and assigned confirmed trips for E2E.

P2:

- Production Firebase, Supabase server key, realtime auth secret, worker secret, and support contacts must be configured.
- Production monitoring/ops runbooks for provider failures should be finalized.

P3:

- Incident reporting.
- Driver earnings/payouts.
- Explicit assignment history for declined/released trips.

## Developer Rules

- Use `allowedActions` from trip DTOs to render buttons.
- After every action, replace local trip state with the action response and refetch detail if needed.
- Keep REST as source of truth; realtime is an accelerator.
- Continue working when `journeyIntelligence` is null.
- Never show customer payment information in the Driver app.
