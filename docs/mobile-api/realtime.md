# Realtime Contract

Status: PLANNED provider delivery, IMPLEMENTED scoped backend metadata.

The current codebase has Supabase Storage integration but no installed Supabase JS client and no existing Realtime wiring. Phase 4 implements the secure backend contract, latest-state snapshots, and scoped channel metadata. Provider delivery should be enabled in staging with Supabase Broadcast/Presence or an equivalent realtime service.

## Supabase Mechanism Decision

Broadcast:

- Recommended for live trip GPS updates.
- GPS is high-frequency ephemeral data and should not depend on permanent Postgres writes for every event.

Presence:

- Recommended for online/offline driver presence.
- Presence should remain separate from persistent `Driver.status`.

Postgres Changes:

- Suitable for low-frequency authoritative lifecycle events if needed.
- Not recommended for raw GPS because it couples hot location traffic to database write streams.

Future chat:

- Do not reuse GPS channels for chat.
- Chat needs separate authorization, retention, moderation, and delivery rules.

## Channel Model

Trip tracking:

```text
trip:{bookingLegId}:tracking
```

Driver presence:

```text
driver:{driverId}:presence
```

The IDs are internal opaque database IDs. Do not put emails, phone numbers, plate numbers, or passenger names in channel names.

## Scope Metadata

Snapshot endpoints return short-lived scoped metadata:

```json
{
  "provider": "supabase-broadcast",
  "channel": "trip:leg123:tracking",
  "permission": "subscribe",
  "expiresAt": "2026-08-15T12:05:00.000Z",
  "token": "server-signed-scope"
}
```

Do not put service-role keys or unrestricted realtime credentials in Flutter.

## Event Schema

Location:

```json
{
  "event": "trip.location.updated",
  "version": 1,
  "bookingLegId": "leg-id",
  "bookingId": "booking-id",
  "occurredAt": "2026-08-15T12:00:00.000Z",
  "sequence": 42
}
```

Lifecycle:

```json
{
  "event": "trip.driver_arrived",
  "version": 1,
  "bookingLegId": "leg-id",
  "bookingId": "booking-id",
  "status": "driver_arrived",
  "occurredAt": "2026-08-15T12:00:00.000Z"
}
```

Do not send full Prisma models over realtime channels.

## Reconnect Strategy

Flutter must call the snapshot endpoint after reconnecting. Realtime messages may be missed. The latest snapshot tells the app current lifecycle state, tracking state, freshness, and last known location.

## Current Boundary

Implemented:

- latest location persistence
- driver presence persistence
- tracking snapshots
- driver location publish validation
- scoped realtime metadata/token generation

Planned:

- Supabase Broadcast delivery
- Supabase Presence socket integration
- Flutter subscription UI
- map display
- chat
- push notifications
