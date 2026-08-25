# Mobile Notifications API

Phase 5 adds backend notification infrastructure for the separate Beninfy customer and driver Flutter apps. It does not implement Flutter UI and does not send production pushes by default.

## Provider Decision

Firebase Cloud Messaging is the selected push infrastructure target because it supports Flutter Android directly and iOS through APNs integration. The backend does not couple domain code to FCM. All delivery flows go through a `PushNotificationProvider` abstraction in `src/lib/mobile/notifications.ts`.

Current provider modes:

- `PUSH_PROVIDER=disabled`: implemented safe default. Events persist; delivery is marked skipped/configuration-safe.
- `PUSH_PROVIDER=mock`: implemented for non-production tests.
- `PUSH_PROVIDER=fcm`: planned provider adapter. Server credentials must stay server-only.

## Push Token Registration

Implemented:

`POST /api/mobile/v1/devices/push-token`

Auth: mobile bearer access token.

Request:

```json
{
  "token": "fcm-or-apns-token",
  "platform": "android",
  "appType": "customer",
  "deviceId": "optional-stable-install-id",
  "deviceName": "optional-display-name",
  "appVersion": "1.0.0",
  "language": "en"
}
```

Rules:

- Customer principals may only register `appType=customer`.
- Driver principals may only register `appType=driver`.
- `userId` and `driverId` are never accepted from the client.
- Re-registration upserts by device/app or token/app to support token rotation.
- Language supports `en` and `fr`; unsupported values fall back to English.

Notification title/body are rendered on the server and persisted at event creation time. Language resolution uses:

1. the authenticated user's persisted `User.locale` when set
2. the latest active push device language for the matching app audience
3. English

Templates are audience-aware. Customer notifications keep customer-facing copy; driver notifications use driver-facing copy for audience-specific events such as `trip.driver_assigned` and `trip.completed`.

Errors include:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `PUSH_TOKEN_INVALID`
- `RATE_LIMITED`
- `VALIDATION_ERROR`

## Push Token Removal

Implemented:

`DELETE /api/mobile/v1/devices/push-token`

Request:

```json
{
  "appType": "customer",
  "token": "token-to-revoke",
  "deviceId": "optional-device-id"
}
```

Provide `token`, `deviceId`, or both. Removal is scoped to the authenticated principal and marks the token revoked rather than deleting history.

## In-App Notification List

Implemented:

`GET /api/mobile/v1/notifications?limit=20&cursor=<id>&unread=true`

Response:

```json
{
  "unreadCount": 3,
  "notifications": [
    {
      "id": "cm...",
      "type": "trip.driver_arrived",
      "title": "Driver arrived",
      "body": "Your Beninfy driver has arrived at the pickup point.",
      "payload": {
        "type": "trip.driver_arrived",
        "version": 1,
        "bookingId": "booking-id",
        "bookingLegId": "leg-id"
      },
      "language": "en",
      "deliveryState": "sent",
      "readAt": null,
      "createdAt": "2026-08-15T12:00:00.000Z",
      "unread": true
    }
  ],
  "pageInfo": {
    "hasMore": false,
    "nextCursor": null
  }
}
```

The endpoint automatically uses the customer app scope for customer tokens and the driver app scope for driver tokens.

## Mark Notification Read

Implemented:

`POST /api/mobile/v1/notifications/:id/read`

This endpoint is idempotent. Users can only mark their own notification records as read.

## Event Types

Implemented event keys:

- `booking.confirmed`
- `payment.confirmed`
- `payment.failed`
- `trip.driver_assigned`
- `trip.assignment_removed`
- `trip.assignment_changed`
- `trip.driver_en_route`
- `trip.driver_arrived`
- `trip.started`
- `trip.completed`
- `trip.cancelled`

Payloads are stable and machine-readable. They do not contain full Prisma records, secrets, provider metadata, or private driver details.

`trip.assignment_removed` remains informational and non-actionable. It carries routing metadata only; Flutter must not infer lifecycle actions from it.

## Flutter Contract

At app start/login:

- obtain the platform push token
- call `POST /api/mobile/v1/devices/push-token`

On token refresh:

- call the same endpoint with the new token and same device id when available

On logout:

- call `DELETE /api/mobile/v1/devices/push-token`

On push open:

- inspect `payload.type`
- use `bookingId` and `bookingLegId` to route to the relevant screen

## Planned

- Durable queue/worker delivery.
- Real FCM HTTP v1 provider adapter and credentials.
- Preference center for non-critical notifications.
- Scheduled reminders.
