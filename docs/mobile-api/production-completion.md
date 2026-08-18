# Mobile Production Completion Contracts

Status: staging-ready backend foundation, with external providers disabled until environment and dashboards are configured.

## Payments

Launch currency is NGN only.

Allowed mobile checkout providers:

- `paystack`
- `payonus`

Payaza/XOF is isolated behind `ENABLE_LEGACY_PAYAZA=true` and is not part of the launch mobile checkout path. Historical records remain readable through payment history/detail/receipt APIs.

Mobile checkout rejects non-NGN currency with:

```json
{
  "error": {
    "code": "UNSUPPORTED_PAYMENT_CURRENCY",
    "message": "Only NGN payments are supported at launch"
  }
}
```

## Route Price Precedence

Pricing precedence for quote and booking creation:

1. Selected fleet-unit route price for the route/scope.
2. Vehicle-category route price for the route/scope.
3. Legacy static fallback only when `ALLOW_LEGACY_STATIC_PRICING_FALLBACK=true`.

`RoutePrice.managedByCategory=true` means the fleet-unit row is inherited/category-managed and may be updated automatically when the category price changes.

`RoutePrice.managedByCategory=false` means the row is explicit. Category edits preserve explicit fleet-unit overrides unless backoffice sends `syncFleetPrices=true`.

## Google Routes

Server-only provider key:

- `GOOGLE_ROUTES_API_KEY`

The backend service is `src/lib/maps/googleRoutes.ts`.

It returns normalized:

- encoded polyline
- distance meters
- duration seconds
- traffic-aware duration seconds when available

Provider failure or missing env degrades journey intelligence to `null` or stale cache. Google output never changes booking/trip lifecycle state.

## Journey Intelligence

Tracking responses may include:

```json
{
  "journeyIntelligence": {
    "routePolyline": "encoded",
    "distanceRemainingMeters": 12000,
    "estimatedArrivalAt": "2026-08-18T10:30:00.000Z",
    "estimatedDurationSeconds": 1800,
    "calculatedAt": "2026-08-18T10:00:00.000Z",
    "freshness": "fresh"
  }
}
```

The object is optional and may be `null`. Flutter must not fabricate ETA, distance, traffic reason, route, or border state.

## Border Journey State

No legal/immigration completion state is inferred from GPS.

Future model should separate:

- `BookingLeg` lifecycle
- explicit journey milestones

Recommended future milestones:

- `approaching_border`
- `at_border`
- `border_processing`
- `border_completed`
- `journey_resumed`

Border completion must require explicit driver/ops action.

## Realtime

GPS:

- persistence remains `LatestTripLocation`
- realtime event is Supabase Broadcast
- stable event: `trip.location_updated`

Chat:

- persistence remains `TripConversation` and `ChatMessage`
- stable event: `chat.message_created`
- Broadcast failure does not fail message persistence

Presence:

- Supabase Presence is separate from driver duty state
- socket connect/disconnect must not mutate `available`, `off_duty`, or `inactive`

## Push

`PUSH_PROVIDER=fcm` uses Firebase Cloud Messaging HTTP v1.

Required server-side env:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Flutter must never receive service-account credentials.

## Workers

Protected worker routes:

- `GET|POST /api/workers/payments/reconcile`
- `GET|POST /api/workers/notifications/deliver`

Required server-only secret:

- `WORKER_SECRET`
- `CRON_SECRET` may also be used for Vercel Cron.

Send as either:

- `Authorization: Bearer <secret>`
- `x-beninfy-worker-secret: <secret>`

## Tours

`TOUR_CATALOGUE_READY`

Mobile tours use the same `Tour` records as web/backoffice for catalogue/detail fields.

`TOUR_BOOKING_NOT_IMPLEMENTED`

Tour booking/payment is intentionally not implemented in this phase.
