# Realtime Tracking Staging Test Plan

Do not run against production.

## Happy Path

1. Driver logs in.
2. Driver has an assigned trip with fleet vehicle.
3. Driver action: `start_en_route`.
4. Driver calls `GET /api/mobile/v1/driver/tracking`.
5. Driver publishes location with `POST /driver/trips/:bookingLegId/location`.
6. Customer calls `GET /customer/bookings/:bookingId/tracking?bookingLegId=:bookingLegId`.
7. Customer subscribes to returned channel.
8. Driver publishes updated location.
9. Customer receives `trip.location.updated`.
10. Driver action: `arrive`.
11. Driver action: `passenger_onboard`.
12. Driver action: `start_trip`.
13. Driver continues location updates.
14. Driver action: `complete`.
15. Further location publishing is rejected.
16. Customer snapshot returns `ended` or no live movement.

## Security Cases

- Unauthorized customer cannot track another customer booking.
- Driver cannot publish for another driver's booking leg.
- Driver cannot publish after decline or assignment release.
- Completed trip rejects further location publishing.
- Outbound leg authorization does not expose return leg.
- Old driver loses permission after reassignment.
- New driver can publish only after assigned and lifecycle state is tracking-enabled.

## Validation Cases

- Invalid latitude/longitude rejected.
- Stale capturedAt rejected.
- Future capturedAt rejected.
- Older delayed location does not replace newer latest location.
- Duplicate retry does not create history rows.
- High-frequency publish eventually returns `LOCATION_RATE_LIMITED`.

## Reconnect Cases

- Customer disconnects, misses realtime update, reconnects, then snapshot returns current state.
- Driver goes offline briefly; trip is not cancelled automatically.
- Customer snapshot shows `stale` after freshness threshold.

Provider-specific delivery guarantees must be tested with Supabase Realtime enabled in staging. Unit tests only cover backend validation, authorization boundaries, and latest-state rules.
