# Payment settlement serialization repair — separate review

Branch: `fix/payment-settlement-serialization`. Prepared for local RC integration; not pushed or deployed. No production financial record was modified.

## Reproduction and root cause

The unchanged `explicit Ride checkout cancellation retains payment and settlement
wins races` test fails on the deletion checkout. Two concurrent requests lock the
same Booking; settlement uses SERIALIZABLE isolation. If cancellation commits
while settlement is waiting on SELECT FOR UPDATE, settlement's snapshot becomes
stale and PostgreSQL raises 40001. Prisma 7.8 + adapter-pg wraps this as P2010 with
`meta.driverAdapterError.cause.kind = TransactionWriteConflict`, not P2034.
The existing P2002/P2034 catch therefore misses it and the HTTP caller can fail
before the provider's paid state is recorded.

## Focused repair

- Recognize P2034 and P2010 with the exact adapter TransactionWriteConflict cause,
  or SQLSTATE 40001/40P01; do not parse free-text error messages.
- Retry the whole rolled-back settlement transaction with a fresh snapshot, at
  most three attempts and 20/40ms waits. Never retry only the failed query inside
  an aborted transaction.
- On retry exhaustion, lock/re-read Booking in the fallback before recording the
  provider-paid result. Preserve already confirmed/completed outcomes; otherwise
  retain paid/ops_review and released inventory. This prevents a stale fallback
  from downgrading a competing successful settlement. Other failures propagate.
- Preserve cancellation-first inventory release and operations review. Preserve
  settlement-first paid/confirmed state; checkout cancellation cannot undo it.
- No schema, provider endpoint, credentials, notification delivery or scheduler change.

## Validation

21 focused checks passed with zero skips: existing Driver-search/checkout race
suite plus new classifier/bounded-retry checks and real PostgreSQL lock-order
tests. A separate observer connection verifies both competing transactions are
waiting before releasing the fixture lock, avoiding pg_stat_activity snapshots
cached by the locking transaction. Both cancellation-first and settlement-first
orders pass. Tests use synthetic bookings on localhost and prohibit live fetch.
Retry-exhaustion cases cover pending, cancelled, ops_review, confirmed and
completed states, duplicate callbacks, unchanged amount/reference/provider and no
new refund resolution. TypeScript passes.

## Independent review and release boundary

The diff only changes Ride settlement conflict retry/fallback handling, adds its
helper and tests, and this document. No migration, refund implementation, provider
call, amount calculation or financial-data backfill is introduced. Verified
provider results still become paid; cancelled inventory stays released and queues
operations review. Confirmed/completed outcomes remain authoritative under retries.
Duplicate callbacks reuse the existing Payment and notification event keys.
Cancellation and settlement use the same Booking-first lock order. Tour settlement
and provider signature/verification code remain unchanged.

Safe to integrate into the dedicated local deletion RC after the 21 focused checks
and TypeScript validation. Full RC regression/build remains a separate gate.
No Production records modified, no deployment or push authorized by this review.
