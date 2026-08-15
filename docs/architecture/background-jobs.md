# Background Job Boundary

Beninfy currently keeps critical domain writes synchronous and treats notification/email delivery as a side effect after successful state changes.

## Current Transitional Policy

- Booking, payment settlement, fleet reservation, and trip lifecycle transitions remain authoritative.
- Push notification failures must not roll back valid domain changes.
- Notification events are persisted before delivery is attempted.
- Delivery attempts are bounded and classified as `sent`, `failed`, `invalid_token`, `skipped`, or `skipped_no_device`.
- `PUSH_PROVIDER=disabled` is the safe default, so production credentials are not required for this foundation.

## Future Durable Job Categories

- Push notification delivery and retry processing.
- Email delivery retry and bounce handling.
- Payment reconciliation for abandoned or delayed provider callbacks.
- Stale mobile session cleanup.
- Stale location and driver presence cleanup.
- Scheduled trip reminders.

## Production Recommendation

Move delivery attempts into a durable worker/queue before high-volume production mobile usage. A worker should pick pending/failed `NotificationDelivery` records where `nextAttemptAt` is due, cap attempts, and update invalid device tokens without blocking user-facing requests.
