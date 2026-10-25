# P0 account deletion safety repair — 2026-10-25

Implemented locally, not committed/pushed/deployed. No Production migration,
Customer deletion, payment change or cron activation occurred. Existing unrelated
Driver/push working-tree changes were preserved. The payment patch is isolated
outside this checkout on `fix/payment-settlement-serialization`.

## Root cause and authoritative ordering

The old worker scanned eligible users outside a transaction, deleted child records
inside a transaction, and only then conditionally updated User. A restoration
between selection and that update left the update count zero but still committed
the child deletes.

`src/lib/accountDeletionWorker.ts` now acquires User FOR UPDATE and re-reads all
eligibility predicates inside the same READ COMMITTED transaction before deleting
anything. Restoration explicitly takes the same first lock. If restoration
commits first, the stale worker skips all mutations. If anonymization owns the lock
first, restoration waits and then rejects the already-anonymized account. This
defines a serializable outcome for these transitions without claiming globally
serializable isolation for unrelated application writes.

Concurrent workers commit only one anonymization/audit/outbox row. A per-account
DB failure rolls back that account and is counted; other batch candidates continue.
The existing exported function names remain available through customerProduct.
No booking/payment/financial deletion rule changed.

## Audit parity

The shared scheduling helper now writes `customer.account.deletion_requested`
inside the disabling transaction for both channels: public_web/email_otp,
mobile/password, mobile/recent_session. Pending repeats preserve the original
dates and do not create another request event. Password/Google proof requirements
and API response contracts remain unchanged. Audit metadata has no code, password,
bearer, email or device token. Web OTP consumption shares the transaction.

Restoration's existing `restore_deletion` audit is now atomic with restoration;
the route passes the authorized Super Admin ID and no longer writes a separate
post-commit audit. Worker anonymization and cleanup completion also have atomic
minimal events. An audit outage rolls back the associated DB mutation.

## Durable avatar cleanup and schema

Additive Prisma migration: `20261025120000_account_deletion_cleanup` creates one
private `AccountDeletionCleanup` table, unique per User, with status/attempt/target
checks, due-work index, User FK RESTRICT and RLS. PUBLIC/anon/authenticated receive
no access. No existing Customer or business rows are rewritten. Production
migration is required before using the changed worker and has NOT been run.

Anonymization stores the current avatar URL in this outbox in the same transaction
that clears User.image. External deletion happens only after that commit. The
existing Supabase deletion implementation is reused with a strict owning-avatar
path check and five-second request timeout. Cleanup rows are locked SKIP LOCKED;
concurrent calls skip owned work. 404 is success. DB rollback after provider
success retains the job, allowing a safe repeated DELETE. Successful jobs clear
the stored URL. Retries back off and stop automatically after eight attempts;
blocked work remains durable and visible rather than disappearing.

Unknown/mismatched storage targets and missing configuration remain unresolved;
only known Google-hosted profile photos are treated as externally owned and
skipped. Restored/non-anonymized account jobs are blocked without provider calls.
Legacy failed cleanup whose URL was already erased cannot be reconstructed by
this additive migration and needs separately authorized reconciliation.

## Operations and policy

See [worker operations](./account-deletion-worker-operations.md) for the proposed
five-minute Supabase pg_cron/pg_net/Vault schedule, response/log fields, alert
thresholds and responder approval. No scheduler/alert was activated. The existing
payment cron remains exactly `0 3 * * *`; no Vercel notification cron was added.
Available Supabase connections do not establish access to the Beninfy Production
project, so an actual recurring anonymization trigger is still unverified.

See [retention approval matrix](./account-deletion-retention-approval.md) for all
nine categories, minimum data, purposes, operational proposals and legal decisions.
These are draft operational proposals, not invented statutory rules. No retention
purge or legal-period promise was deployed. EN/FR avatar wording now describes
durable retry, without promising immediate complete erasure.

## Validation and remaining release gates

- 27 focused deletion checks pass: original stale-selection regression, actual
  PostgreSQL contention in both restoration/worker orders, concurrent workers,
  due eligibility/reruns, DB/audit rollback, mobile audit parity, original web
  ownership controls, bounded avatar retries, 404, preserved work after a failed
  DB commit following external deletion, and sanitized worker HTTP summaries.
- Full non-HTTP backend run: 411 reported tests, 409 pass, 2 failures (the original
  payment-race assertion and its parent), zero skipped. The additional mobile
  audit-failure test was subsequently run in the final focused suite. The previous
  push concurrency assertion passed; no test was skipped or weakened.
- Separate payment branch: 16 focused checks passed, including the unchanged
  failing test and deterministic PostgreSQL cancellation-first/settlement-first
  cases. Its classifier recognizes P2010 adapter TransactionWriteConflict and
  retries the entire transaction at most three times. It is not merged here.
- Deletion TypeScript and focused ESLint pass. Full repository ESLint still has
  exactly 19 errors and 3 warnings, all in pre-existing files: CommonJS import
  rules in prisma.config.js and four maintenance scripts, synchronous effect
  state update in useRoutePriceOverrides, and existing font/unused-import warnings.
  No unrelated formatting fix or suppression was introduced.
- Production build passes locally with DATABASE_URL, DIRECT_URL and
  PRISMA_MIGRATE_URL pinned to disposable localhost PostgreSQL. No Production
  build/deploy command was issued. All 7 local HTTP/browser checks pass, including
  Admin authorization and EN/FR real SMTP verification, session invalidation,
  blocked re-login, responsive layout and scoped accessibility.

Production remains blocked pending retention/legal approval and implemented
matching rules, verified scheduled processing/alerts/responder, separate payment
review/integration, repository lint remediation, and explicit deployment approval.
Review the selected release against current Production before migration/deploy.
