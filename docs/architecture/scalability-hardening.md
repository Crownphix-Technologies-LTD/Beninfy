# Backend Scalability Hardening

This phase keeps the existing stack: Next.js API routes, Prisma, PostgreSQL, Auth.js sessions, and the current mobile API contracts.

## Connection Management

- Runtime code uses the shared Prisma client in `src/lib/prisma.ts`.
- PostgreSQL traffic should continue to use the pooled `DATABASE_URL`.
- Migrations should use `PRISMA_MIGRATE_URL` or `DIRECT_URL` so schema changes do not compete with pooled application traffic.
- No new database provider, ORM, or server framework was introduced.

## Indexes Added

Migration: `prisma/migrations/20260815120000_scalability_concurrency_indexes/migration.sql`

The migration adds indexes for common reads:

- Mobile sessions by user, revocation, and expiry.
- Customer booking history by user and creation time.
- Admin/ops booking queues by status and creation time.
- Fleet availability by vehicle/category, status, and date.
- Driver trip queues by driver/status/date.
- Payment reconciliation by booking, status, provider, and creation time.

It also adds a partial unique fleet reservation guard:

- Unpaid `payment_pending` legs may coexist.
- Active statuses `reserved`, `unassigned`, `assigned`, and `dispatched` cannot hold the same physical fleet unit for the same service day.

## Pagination And Payload Size

- Mobile customer and driver endpoints already use cursor pagination.
- The web customer bookings endpoint now supports `limit` and `cursor` while preserving the existing `bookings` response key.
- Default customer booking page size is 50, capped at 100.
- Admin bookings were already capped.

## N+1 Review

Current APIs generally use Prisma `include`/`select` rather than per-row follow-up queries. The main risk is payload size from wide includes on admin screens. Future admin views should prefer narrow list DTOs and fetch details only when a drawer/modal opens.

## Booking And Fleet Concurrency

Booking creation already runs in a serializable transaction. This phase adds a database-level active fleet-unit uniqueness guard so application checks are backed by Postgres.

Payment settlement now:

- Re-checks fleet conflicts during the paid settlement transaction.
- Treats duplicate successful callbacks/webhooks as idempotent.
- Sends success notifications only once.
- Converts race conflicts into operations review instead of a generic 500.

Driver trip status changes now use an atomic guarded `updateMany` so concurrent driver actions cannot both advance the same leg from a stale status.

## Rate Limiting

The shared rate-limit bucket now updates inside a serializable transaction and retries once on Postgres serialization conflicts. This prevents parallel serverless invocations from undercounting the same bucket.

## Session And Token Hardening

Mobile refresh-token rotation now compares the old refresh-token hash during update. If another request already rotated the same token, the second request fails as unauthenticated.

Recommended scheduled cleanup:

- Delete or archive expired/revoked `MobileSession` rows after a retention window.
- Delete old `RateLimitBucket` rows whose windows have expired.
- Keep audit logs according to the company retention policy.

## Background Jobs

Good candidates for a queue or scheduled worker:

- Payment reconciliation for stale pending bookings.
- Email notification retries.
- SMS/WhatsApp notification retries if added later.
- Expired mobile session cleanup.
- Rate-limit bucket cleanup.

Do not run long notification work inside payment webhooks.

## Caching

Safe candidates:

- Public route catalogue.
- Public vehicle categories.
- Tours.
- Static pricing reference after admin invalidation.

Do not cache:

- Live availability decisions.
- Booking/payment status.
- Auth/session state.
- Driver assignment state.

## Observability

Recommended next layer:

- Structured request IDs for API responses and logs.
- Payment provider event IDs in audit metadata.
- Error tracking for webhook and settlement failures.
- Metrics for booking creation latency, payment settlement result, rate-limit denies, and DB transaction retries.

## Health Endpoint

`GET /api/health` returns a tiny no-store JSON response without secrets or database details. It is safe for uptime checks but is not a database diagnostic endpoint.

## Mobile Compatibility

Existing mobile API contracts are preserved. Cursor pagination and guarded state transitions are compatible with the Flutter driver and customer foundations.
