# Account deletion integrated release candidate — 2026-10-25

Local review only. **No Production deployment, migration, scheduling, real-account
processing, real payment change, notification delivery or publication was performed.**

## Scope and recovery

Branch: `release/account-deletion-rc-20261025` in
`C:/Projects/Beninfy-release-candidate`.

- Deletion implementation/repair: `eb68ade` (web ownership flow, shared lifecycle,
  restoration lock, atomic audit, durable avatar outbox, metrics, additive migration).
- Payment integration: `8e0b40f`, cherry-picked from `005764a` on the preserved
  `fix/payment-settlement-serialization` worktree. Independent review is recorded
  in `payment-serialization-repair.md`.
- Existing lint errors: `a9e04ce`, six files only; no rule suppression or broad formatting.
- Migration assertion correction: `600f4a7`. PostgreSQL rejects deleting an outbox
  owner with SQLSTATE 23001 (restrict_violation), not 23503. This was verified with
  an isolated reproduction and PostgreSQL's error-code documentation; the rejection
  assertion remains mandatory. No existing regression assertion was weakened.

Recovery references remain intact:

- `recovery/account-deletion-before-rc-20261025`: `d2b3e6dc00a13d376b1237945d5ddab54c8e7ffe`
- `recovery/payment-before-rc-20261025`: `a1682255f0f3059ecb773d4b0befeca10a2fb3b1`

The original checkout retains unrelated Driver avatar/push and scheduler work.
Those uncommitted feature files and tests are deliberately outside this RC. The
complete test suite here means every test file tracked in the selected RC, including
existing Customer/Driver mobile contracts and push support. Nothing was force-pushed
or discarded; this RC has not been pushed.

## Payment review

Only the existing Ride settlement transaction is retried, up to three whole
transactions with fresh snapshots. Exact P2034/P2010 PostgreSQL conflicts are
recognized; unrelated errors propagate. Both normal settlement and exhausted-retry
fallback lock Booking first. The fallback rechecks authoritative state and preserves
confirmed/completed bookings. Cancellation-first keeps released legs cancelled and
records paid/operations-review; settlement-first remains confirmed/reserved.

21 focused checks passed before integration, including the unchanged original race,
real PostgreSQL competing lock orders, exhausted retries across five booking states,
duplicate callbacks, preserved amount/reference/provider and no refund resolution.
No provider verification, refund implementation, amount calculation, Tour settlement,
financial backfill or payment migration changed. Safe to integrate locally.

## Migration and deletion evidence

`20261025120000_account_deletion_cleanup` creates only the private outbox and its
indexes/constraints/access restrictions. No old table is dropped or rewritten.
Unique User ownership, due-work index, RESTRICT foreign key, valid status/attempt
bounds and completion/URL invariants are enforced. RLS is enabled; PUBLIC, anon and
authenticated receive no table access. Migration tests preserve synthetic User,
Booking and Payment snapshots and reject destructive/invalid outbox transitions.

Lifecycle tests cover both actual restoration/anonymization lock orders, stale
candidate scans, concurrent workers, one completion audit, audit rollback, mobile/web
request parity, durable cleanup retries, provider 404, DB rollback after storage
success, eight-attempt blocking and sanitized aggregate monitoring. No real accounts
or storage objects are used.

## Validation evidence

Final validation: **PASS ? engineering RC ready; Production deployment NOT ready.**

| Check | Result |
| --- | --- |
| Complete backend suite | 402/402 pass, zero failed/skipped; all 22 non-HTTP test files |
| Real HTTP/browser | 7/7 pass, zero failed/skipped; remaining two test files |
| Combined tracked suite | 409/409 pass; all 24 test files executed |
| PostgreSQL integration/migration | PostgreSQL 18.4; 44 migrations applied, zero incomplete; fresh historical fixtures; Supabase-role access branch also tested |
| Deletion/payment/auth/mobile/push | All pass, including original races and concurrency tests; no assertion weakened |
| TypeScript | tsc --noEmit passes with generated route types, including final tests |
| ESLint | Zero errors; three existing warnings |
| Prisma | validate/generate pass; normal build migration step uses localhost only |
| Production build | npm run build passes unchanged with standalone lockfile dependencies |
| Whitespace | git diff --check passes |

Remaining warnings: root layout Google font display and page-custom-font rules;
unused CarIcon in RouteMapSVG. The 19 errors were fixed without rule suppression.
The four maintenance scripts received import-only changes and syntax checks;
they were never executed. Route-price loading now tracks the active request input,
retaining cancellation guards, fetch behavior and override results.

All build/database commands explicitly set DATABASE_URL, DIRECT_URL and
PRISMA_MIGRATE_URL to synthetic localhost PostgreSQL. Full integration runs set
all five test database variables to that fixture. Test execution is serial per file;
individual concurrency tests still use genuinely competing database transactions.
The two HTTP files run against the actual localhost production build with synthetic
accounts, a non-relaying local SMTP sink, disabled push and no live provider calls.
Browser coverage includes EN/FR, keyboard access, 320/390/1280 widths, scoped axe,
actual verification code confirmation, session invalidation and blocked re-login.

The final Supabase-role fixture initially had a test-only dollar-quoting typo;
that SQL fixture was corrected without changing any permission assertion. The
final complete rerun includes these checks and passes. Earlier failure logs remain
available locally for review.
Logs are local ignored files under
`C:/Projects/Beninfy/node_modules/.cache/dispatch-db/rc-*`.

The first build attempt exposed a local Turbopack limitation with an external
node_modules junction. The RC now uses its own lockfile dependency installation;
no production configuration was changed to bypass the build. A first offline install
could not find the pinned Playwright tarball and was retried normally.

The local migration test initially expected the wrong SQLSTATE; all other 401 checks
passed. After the specific correction, all 402 checks passed with zero skips. The
previously intermittent push-concurrency assertion passed in both full runs.

## Production gates — still closed

- Five-minute Supabase pg_cron/pg_net/Vault design is supported. No job was enabled.
  Verify the actual Production project, extension versions, existing jobs, Vault
  secret match and backend privileges with authorized access before activation.
  Worker secret auth remains mandatory. Payment cron stays `0 3 * * *` unchanged.
- Worker metrics and sanitized failure/backlog responses are implemented and tested.
  Alert thresholds are documented, not deployed: no completion 15m; two consecutive
  non-2xx or any blocked cleanup; eligible backlog age 30m warning/2h page; cleanup
  age 24h; growing retry backlog over three runs.
- Management must name primary/backup responders, alert destination and coverage.
  Proposed role names are not an operational handover.
- `account-deletion-retention-approval.md` contains the final decision register.
  All nine retained-data categories and legal-hold, public-copy and operational
  decisions remain pending. Draft operational periods are not approved legal
  requirements. Finance/legal must establish actual applicable obligations; vendor
  backup/provider limits need contract/plan verification.
- After approval, implement/test matching purge/redaction rules before publishing
  the corresponding policy. Approval alone does not enable any purge rule.
- Reconcile this selected RC against the then-current Production base and obtain
  explicit deployment/migration/scheduler/publication authorization.

References: [Supabase Cron](https://supabase.com/docs/guides/cron),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net),
[PostgreSQL SQLSTATE codes](https://www.postgresql.org/docs/current/errcodes-appendix.html).
