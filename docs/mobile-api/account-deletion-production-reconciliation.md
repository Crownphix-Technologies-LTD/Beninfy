# Account-deletion production reconciliation ? 26 October 2026

## Release boundary

Git reconciliation, validation and a guarded feature-branch push only. No Production
deployment, migration, deletion/purge, cron activation, payment mutation or public
policy publication is authorized. Do not merge this branch to main without a
separate controlled-release authorization: `npm run build` runs Prisma migrations.

## References and recovery

- Repository: Crownphix-Technologies-LTD/Beninfy.
- Verified origin/main and live www.beninfy.com Production deployment:
  `7cca3ca96213481c94e9bf464ce7ff0a3150897f`.
- Frozen original RC: `release/account-deletion-rc-20261025`,
  `8f870542a3f057763d008fac233a238fe52d1876` (unchanged).
- Merge base: `bc0fb6bfb026003dfebdc8445310e77328418909`; histories diverged.
- New branch: `release/account-deletion-production-20261026`, based on origin/main.
- Normal two-parent merge: `2d14b0324d3a2b7c2edf478955f0f488fdf60f9e`.
- Compatibility repair: `ee4b55564465236fe572fb99a492c31be560196f`.
- Provisional policy documentation: `5dc352e84a04d2d2d1fc618423f9c5395525a00b`.
- Recovery references: `recovery/account-deletion-rc-before-reconcile-20261026`
  and `recovery/local-work-before-reconcile-20261026` (snapshot `504a047`).
  Earlier deletion/payment recovery refs and both original worktrees remain intact.

Original commits remain traceable through the merge, without duplicating/rebasing
commits already on main: `eb68ade` contains the original web verification,
lifecycle repair, atomic audit, outbox and initial migration/tests/docs together;
`8e0b40f` is payment serialization; `a9e04ce` is lint remediation; `600f4a7` and
`8f87054` are migration verification/evidence. The original bundled deletion commit
was not rewritten into an invented history of smaller commits.

## Semantic reconciliation

The sole text conflict was adjacent independent Prisma models: SavedTraveller and
AccountDeletionCleanup. Both models and User relations are retained. Automatic
merges retain Google site verification, locale accessibility and Saved Traveller
export. Current production OTP, Google/linking, password authentication, guest
Ride/Tour discovery, Saved Traveller APIs and Customer/Driver push implementations
remain present; their regression suites pass. Paystack/settlement behavior retains
the reviewed serialization fix, byte-identical to the RC.

The older RC did not know about SavedTraveller, CustomerAuthOtpChallenge or
User.phoneVerified. The compatibility repair removes the authenticated account's
saved travellers and linked unified OTP challenges and clears phoneVerified in the
same locked anonymization transaction. EN/FR deleted-data copy matches this.
Strengthened lifecycle tests verify cleanup, idempotency, preservation of future
and restored accounts, and rollback of those new deletions on audit/DB failure.
Booking snapshots and payment records are not rewritten. This is account-profile
cleanup, not implementation of the nine provisional retention purge schedules.

Eight-digit web codes, ten-minute expiry, five attempts, identity binding, replay
and abuse protection, immediate access disablement, default 30-day eligibility,
privileged pre-anonymization restoration, User row-lock revalidation, atomic audit,
avatar outbox, retries and aggregate monitoring remain covered by passing tests.

## Migration evidence

All 45 origin/main migration SQL files are unchanged byte-for-byte after line-ending
normalization. Only `20261025120000_account_deletion_cleanup` is added, after the
current migration chain. All 46 migrations completed on disposable PostgreSQL 18.4.

The new migration creates a private outbox only: unique User owner, restrictive FK,
retry index, bounded attempts and state/target checks, RLS and revoked public/client
access. Tests prove existing User/Booking/Payment fixtures unchanged, constraints
and privacy enforced, and durable retry target preservation. No Production database
connection was used. Production's 45-completed/zero-incomplete state is the owner's
supplied evidence, not a new live database query. Expected pending migration: one.

## Validation ? all pass, no skipped tests

- Prisma validate and generate.
- Full non-HTTP suite: 439/439, including deletion, payment serialization, real
  PostgreSQL lock-order races, auth/authorization, mobile, push, and Tour regressions.
- Unified Customer OTP PostgreSQL suite: 1/1 in a separate disposable database,
  preserving its strict `beninfy_otp_auth_test` database-name safety check.
- Real HTTP/Admin authorization plus EN/FR browser/accessibility: 7/7 against the
  local production build, synthetic accounts and a non-relaying localhost SMTP sink.
- Total: **447/447**, zero failures/skips. The previous push concurrency issue did
  not recur. No assertions were weakened or regenerated.
- TypeScript (`next typegen`, `tsc --noEmit`): pass.
- ESLint: zero errors; three pre-existing warnings (two root-layout Google-font
  warnings and one unused CarIcon in RouteMapSVG).
- `npm run build`: pass. DATABASE_URL, DIRECT_URL and PRISMA_MIGRATE_URL explicitly
  pinned to a disposable localhost database; PUSH_PROVIDER disabled. Build-time
  migrate deploy found no outstanding local migrations.
- `git diff --check`: pass.

Local logs are under the original checkout's ignored
`node_modules/.cache/dispatch-db/reconcile-{full-tests,http-tests,eslint,build}.log`;
OTP evidence is in this worktree's ignored
`node_modules/.cache/deletion-readiness/otp-tests.log`. Browser artifacts are under
`node_modules/.cache/deletion-ui/`. No credentials or environment files are committed.

## Safe Git push

`vercel.json` disables Git deployments for this exact integration branch, in addition
to the existing disabled feature branch. No overlapping true rule exists. The
payment cron remains exactly `0 3 * * *`; no push/deletion cron is added. There are
no GitHub Actions workflows or custom local Git hooks in the inspected repository.
Production remains main. This prevents a Vercel Preview build from running the
migration-bearing build against unverified environment resources.

Reference: https://vercel.com/docs/project-configuration/git-configuration

## Policy and remaining Production gates

All nine original retention matrix rows/periods are preserved verbatim. They are
provisional internal operational targets, not verified statutes or implemented
purge deadlines. Financial-ledger duration remains TBD. The 30-day grace is
approved; processing completion is not guaranteed within 30 days. No self-service
restoration is promised.

Before any Production release: legal/privacy and finance review (including final
public EN/FR wording); verified off-site database and avatar recovery capability;
backlog/configuration/Vault checks; alerts and delivery verification; confirmation
of the CTO backup responder and coverage. Primary is Idowu James; destination is
info@crownphix.tech. Cron activation needs separate authorization after deployment
checks. Neither public deletion URL availability nor Google Play readiness is
claimed by this local validation.
