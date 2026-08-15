# Realtime Location Architecture

Status: IMPLEMENTED backend foundation; provider realtime delivery remains staging work.

## Technology Decision

Current Supabase code usage is storage-only. There is no Supabase JS client package and no existing Realtime subscription implementation in the platform.

Chosen Phase 4 backend approach:

- PostgreSQL stores authoritative business state.
- PostgreSQL stores only latest trip-scoped location and driver presence snapshots.
- Supabase Broadcast is the preferred future delivery mechanism for high-frequency location events.
- Supabase Presence is the preferred future delivery mechanism for socket online/offline presence.
- Postgres Changes may be used for low-frequency lifecycle events, but not raw GPS.

This avoids creating unbounded GPS history while still letting reconnecting customers recover state through REST snapshots.

## Presence Model

`Driver.status` remains persistent duty/admin state: `available`, `off_duty`, `inactive`.

`DriverPresence.status` is realtime operational presence: `online`, `offline`, plus `lastSeenAt`.

Socket disconnects must not automatically mark the driver inactive.

## Tracking Window

Tracking starts when a driver-owned leg reaches:

- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`

Tracking stops when:

- leg completes
- leg is cancelled
- driver assignment is released through decline/cancel
- leg returns to `unassigned`
- latest location expires

## Latest Location

`LatestTripLocation` has one row per `BookingLeg`. It is a latest-state cache, not permanent history.

Out-of-order strategy:

- Prefer sequence when both existing and next payload have sequence.
- Otherwise compare `capturedAt`.
- Older updates do not replace newer latest state.

Freshness defaults:

- fresh for 90 seconds
- expires after 15 minutes

## Channel Model

Trip tracking:

```text
trip:{bookingLegId}:tracking
```

Driver presence:

```text
driver:{driverId}:presence
```

Channels use internal opaque IDs only.

## Authorization

Customers can subscribe only through booking ownership.

Drivers can publish only when:

- authenticated as driver
- linked to the assigned `Driver`
- leg belongs to that driver
- booking is confirmed/completed
- leg status is tracking-enabled

The server returns short-lived scoped metadata. Flutter must never receive Supabase service-role keys or backend secrets.

## Privacy

Customer location visibility is trip-scoped. There is no `GET /drivers/:driverId/location`.

After completion, cancellation, expiry, or reassignment, the customer should not continue receiving the old driver's movement.

## Cleanup

Recommended scheduled cleanup:

- delete expired `LatestTripLocation` rows after a short retention buffer
- mark stale `DriverPresence` rows offline after the configured stale threshold
- delete old presence rows only if operational retention policy permits

Do not do expensive cleanup on every location update.

## Degraded Mode

If realtime provider delivery degrades, REST snapshots remain usable. The primary health endpoint should not fail solely because realtime is degraded unless product policy requires it.

## Not Implemented

- Flutter UI
- Google Maps UI
- Supabase client subscription wiring
- chat
- push notifications
- driver earnings
- indefinite location history
