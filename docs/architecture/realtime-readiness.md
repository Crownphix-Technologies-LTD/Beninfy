# Realtime Readiness

No realtime GPS, chat, push notifications, or live tracking was implemented in this phase.

## Recommended Future Shape

Use the existing backend as the source of truth:

- Bookings and payments remain in PostgreSQL.
- Driver identity remains linked through `User`, `Driver`, and `MobileSession`.
- Trip status remains in `BookingLeg`.

For future live GPS:

- Add a dedicated location ingestion endpoint for authenticated drivers.
- Store current location separately from booking/payment records.
- Use short retention for high-frequency location points.
- Publish sanitized location updates to customers only for their active trips.
- Apply strict per-driver rate limits and payload validation.

For future push notifications:

- Store device tokens per mobile session/device.
- Send push from background jobs after authoritative booking/payment state changes.
- Keep email as a fallback notification path.

For future chat:

- Keep chat permissions tied to booking membership.
- Store messages separately from booking state.
- Do not make chat delivery part of payment or booking transactions.

## Supabase Realtime Evaluation

Supabase is already in the stack, but each realtime primitive should be used for the right workload:

- Broadcast: best future fit for high-frequency ephemeral GPS updates after the backend validates the driver and trip. Broadcast avoids treating every location ping as permanent operational data.
- Presence: good fit for driver online/offline state and lightweight availability indicators. It should not replace authoritative driver assignment or trip status in PostgreSQL.
- Postgres Changes: good fit for low-frequency authoritative events such as trip status updates, booking assignment changes, and payment status changes. It is not the right default for raw high-frequency GPS because it couples hot realtime traffic to permanent database writes.
- Chat: possible with either database-backed messages plus low-frequency change events, or a dedicated messaging service later. Chat delivery should remain separate from payment settlement and booking transactions.

Recommendation: use PostgreSQL for authoritative booking/payment/trip state, Supabase Presence for online state, and Supabase Broadcast or a dedicated realtime service for live GPS. Only persist sampled/intentional location history if the business needs it.

## Current Boundaries

This hardening phase intentionally avoided:

- Firebase migration.
- Realtime subscriptions.
- WebSocket infrastructure.
- Driver GPS collection.
- Chat.
- Push notification implementation.
