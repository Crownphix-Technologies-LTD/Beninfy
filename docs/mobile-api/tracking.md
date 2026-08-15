# Trip Tracking Mobile API

Status: IMPLEMENTED backend foundation. Flutter UI and maps are not implemented here.

The backend uses snapshot REST APIs plus future realtime updates. Realtime events alone are not the source of truth.

## Driver Presence

`POST /api/mobile/v1/driver/presence`

```json
{
  "status": "online",
  "currentBookingLegId": "optional-leg-id"
}
```

Presence is separate from persistent `Driver.status`. A short disconnect must not make an admin duty status inactive.

## Driver Tracking Snapshot

`GET /api/mobile/v1/driver/tracking`

Returns tracking-eligible assigned legs. Flutter uses this to determine whether publishing is currently allowed.

Tracking-enabled statuses:

- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`

Tracking is not enabled for `assigned`, `unassigned`, `payment_pending`, `completed`, or `cancelled`.

## Driver Location Publish

`POST /api/mobile/v1/driver/trips/:bookingLegId/location`

```json
{
  "latitude": 6.5244,
  "longitude": 3.3792,
  "accuracyMeters": 18,
  "headingDegrees": 90,
  "speedMetersPerSecond": 8.4,
  "capturedAt": "2026-08-15T12:00:00.000Z",
  "sequence": 42
}
```

Validation:

- latitude: `-90` to `90`
- longitude: `-180` to `180`
- accuracy: `0` to `5000` meters
- heading: `0` to `360`
- speed: `0` to `90` m/s
- captured time cannot be too stale or too far in the future

The backend stores only latest trip location. It rejects stale/out-of-order updates from overwriting newer state.

## Customer Tracking Snapshot

`GET /api/mobile/v1/customer/bookings/:bookingId/tracking?bookingLegId=:bookingLegId`

Authorization:

- authenticated customer only
- customer must own the booking
- requested leg must belong to the booking

Response includes:

- `trackingStatus`: `live`, `stale`, `unavailable`, or `ended`
- `operationalStatus`
- `customerStatus`
- public driver subset
- public vehicle subset
- last known location if still stored
- scoped realtime subscription metadata

Customers cannot query arbitrary driver locations.

## Freshness

Default freshness: `TRACKING_LOCATION_FRESH_SECONDS=90`.

Default expiry: `TRACKING_LOCATION_EXPIRES_SECONDS=900`.

Flutter should show:

- `live`: recent location
- `stale`: last known location is old
- `unavailable`: tracking not active or no location yet
- `ended`: trip completed/cancelled or assignment released

## Reassignment

If a driver declines/cancels and the leg returns to `unassigned`, publishing is rejected and latest location expires. A newly assigned driver must obtain fresh tracking permission for the same leg after lifecycle eligibility resumes.

## Round Trips

Outbound and return legs are independent. A token or snapshot for one `BookingLeg` does not authorize the other.
