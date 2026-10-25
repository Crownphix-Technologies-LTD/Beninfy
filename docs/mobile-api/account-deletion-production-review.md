# Account deletion production gate — 2026-10-25

**Historical pre-repair review below.** The subsequent local P0 safety repair is
recorded in [account-deletion-safety-repair.md](./account-deletion-safety-repair.md).
The restoration race, mobile audit gap and non-durable avatar cleanup described
below are repaired locally; scheduling, retention and release gates remain open.

Status: **BLOCKED**. This is a readiness review, not legal approval or Google Play
certification. No Production data was changed, no deletion was submitted for a
real account, and neither worker execution nor deployment was performed.
The public implementation is unchanged by this review. New lifecycle tests retain
the intended safety assertion, including a failing restoration-race regression.

## Authoritative request and ownership

- Web: POST `/api/account-deletion/request`, then POST
  `/api/account-deletion/confirm`. Cryptographically random eight-digit email
  code, HMAC-only storage, ten-minute expiry, five attempts, purpose/account/email
  binding, replacement-code invalidation and transactional consumption. Strict
  schema rejects client-selected account IDs. Explicit confirmation is required.
- Web limits: IP 5 requests/15 minutes, email 3/hour, global mail budget 100/hour;
  confirmation IP 20/15 minutes. Origin/JSON checks, 4 KiB body bound, honeypot,
  uniform 202 response before account lookup/SMTP, and replay checks remain intact.
- Mobile: POST `/api/mobile/v1/customer/account/delete`, CUSTOMER bearer and
  completed onboarding, explicit confirmation; current password for password
  accounts or recent mobile-session **activity** for Google-only accounts
  (default 15 minutes). This is not a new Google reauthentication challenge.
  The mobile deletion route has no dedicated attempt limiter of its own.
- Both call `scheduleCustomerAccountDeletion` and persist the same authoritative
  User timestamps, disable access, increment sessionVersion, revoke MobileSession
  and invalidate/revoke PushDevice registrations. Existing requests preserve their
  original scheduled date. Bookings/payments are unchanged by the request.
- Mobile authentication and website credentials/Google/JWT checks reject pending,
  disabled and anonymized accounts. Existing website sessions lose account ID.
- Audit parity is incomplete: web confirmation inserts an atomic AuditLog event;
  mobile scheduling and worker completion only leave User timestamps, with no
  corresponding AuditLog events. Admin restoration writes its audit separately
  after the mutation. Do not describe this as a complete atomic lifecycle audit.

## Grace period and restoration

The page, mobile flow and web flow all use `accountDeletionGraceDays()` with a
30-day default. Noninteger/negative configuration fails. Scheduling uses elapsed
24-hour days; worker eligibility is `scheduledDeletionAt <= now`.
This is an earliest eligibility time, not a processing completion deadline.

Production project metadata inspected through the authorized Vercel CLI has no
`ACCOUNT_DELETION_GRACE_DAYS` override; `WORKER_SECRET`, `AUTH_SECRET` and SMTP
settings are present for Production. Values were not retrieved or printed.
Runtime deployment/environment-file overrides were not independently proved.

Super Admin can POST `/api/admin/users/:id/restore-deletion` before anonymization.
The backend clears disabled/request/scheduled timestamps and increments the
session version. It does not reactivate old mobile sessions or push devices.
There is no Customer self-service restoration endpoint. The code permits
cancellation while pending, even after the scheduled date if processing has not
occurred. Completed anonymization cannot be restored. Public EN/FR copy offers
only a request to support before processing, not guaranteed restoration.

## Worker operation and verified gaps

Worker: `anonymizeDueCustomerAccounts`, POST `/api/workers/accounts/anonymize`.
Default batch 25, clamped to 1–100; oldest scheduled accounts first. One invocation
processes one batch, not the entire backlog.

Authentication: `requireWorkerSecret`, constant-time comparison; WORKER_SECRET
takes precedence over CRON_SECRET. Accepts bearer or x-beninfy-worker-secret.
Missing configuration returns 503; absent/wrong credentials return 401.

Production Vercel metadata reports only payment reconciliation at `0 3 * * *`.
Production deployment at review time is `7cca3ca96213481c94e9bf464ce7ff0a3150897f`
(`dpl_44m2A5aAqjzsDzrVus6kTRjvPLa1`), distinct from this local checkout.
The last-24-hour CLI log query returned zero matching anonymization-worker
records. This is limited evidence, not proof no external scheduler exists.
Supabase connector discovery failed with a missing connection link ID, so no
Production cron table or HTTP response was queried. The previously confirmed
notification cron calls a different endpoint and does not prove anonymization.
**Actual automatic recurrence and successful processing remain UNVERIFIED.**

Read-only operator evidence can be collected with
`scripts/operations/account-deletion-schedule-verification.sql`. Job metadata
alone is insufficient: confirm HTTP results, oldest-due backlog, completed counts,
failure alerts and a named responder. No worker-specific alert configuration or
completion/failure audit is verified.

Failure/retry behavior:

- Each account's DB changes are transactional. DB failure leaves that account
  eligible for a later invocation, but there is no built-in backoff/attempt state.
  An uncaught failure stops the batch; repeated failure of the earliest account
  can starve later accounts. Earlier committed accounts remain completed.
- Normal repeat invocations skip `anonymizedAt != null` accounts.
- **Confirmed restoration race:** candidate selection is outside the transaction.
  Child-data deletions happen before the conditional User update. If restoration
  wins between selection and processing, User update affects zero rows but child
  deletions still commit. The new regression demonstrates saved-place loss on a
  successfully restored account. Fix with transaction-level eligibility/locking
  before destructive work and verify concurrent restore/worker ordering.
- Concurrent workers likewise lack an eligibility lock before child mutations;
  conditional User updates alone do not protect the whole operation.
- Avatar storage deletion runs after DB commit. A non-2xx/non-404 result is returned
  internally but omitted from the route's `{ok,processed,checked}` response.
  A network throw fails the request after anonymization. The avatar URL has already
  been cleared; subsequent scans skip the account. No durable retry record or alert
  preserves this cleanup obligation. Establish durable cleanup/recovery before
  claiming reliable completion.

## Retention decision register

Every category below remains personal or potentially re-identifiable after the
User profile is replaced. Removing the profile is not full anonymization. The
purposes below are observed operational uses or candidates for approval, not
proof that indefinite retention is necessary or legally required. No fixed
category period or implemented purge schedule was found in policy/model/worker.

| Category / model evidence | Personal information | Purpose requiring validation | Minimization/anonymization option | Legal/operational requirement and approval |
| --- | --- | --- | --- | --- |
| Ride/Tour bookings, Booking/BookingLeg/TourBooking snapshots | Passenger names/contact, passport/nationality, dates, pickup and journey coordinates, user links | Fulfil travel, resolve complaints, substantiate transactions | Remove unnecessary passenger/contact/document fields; unlink or aggregate after justified holds; profile replacement alone is insufficient | Operational relationships exist; applicable transport, border, claims and accounting obligations are not established here. Management/counsel must approve fields, trigger, period and holds. |
| Payments/reconciliation, Payment/PaymentResolution | Booking/customer linkage, amounts, references, provider metadata and pricing snapshots | Accounting, settlement, refunds, fraud investigation | Retain minimum ledger evidence; redact unnecessary checkout metadata/contact links subject to obligations | Finance/counsel must identify applicable accounting/tax/provider obligations and approve duration, trigger and archival access. No duration established. |
| Disputes/refunds/support evidence across PaymentResolution, chat and audit | Customer linkage, narratives and transaction/travel context | Resolve active cases and preserve justified evidence | Restrict active-case evidence; delete/redact incidental PII after approved hold ends | Operational case handling exists; counsel must approve claim/hold criteria, release authority and retention after closure. No universal dispute duration established. |
| AuditLog and consent/deletion history | actorId, actorEmail, IP address, arbitrary metadata, entity links and dates | Security/accountability and evidence of requests/decisions | Avoid raw contact/token data; redact old payloads, retain minimal event proofs | Security/legal must approve event-specific periods, access, tamper protection and holds. No fixed period. |
| ChatMessage/TripConversation | Free text, sender IDs, trip/driver/customer links; incidental sensitive content possible | Trip coordination and case investigation | Delete/redact text after justified use; retain aggregates or case-selected evidence | Support/security must justify post-trip retention and approve expiry/hold rules. No fixed period. |
| Notification/NotificationDelivery/AdminNotificationCampaign | User/device links, title/body/payload and provider references; free-text PII possible | Inbox service, delivery troubleshooting and evidence of Admin communication | Purge old payloads, minimize delivery metadata, aggregate performance | Product/security must approve inbox and diagnostic periods separately. Indefinite retention has no verified justification. |
| TourFeedback/TourDriverFeedback/Day attribution | Customer ID, driver names, comments, risk flags and travel dates | Safety review, complaints and service quality | Redact free text and detach identity when no longer needed; aggregate ratings | Operations/security/counsel must approve incident holds and ordinary feedback expiry separately. No fixed period. |
| Revoked MobileSession/PushDevice | User/installation/session IDs, refresh-token hashes, raw inactive FCM tokens and device metadata | Revocation/replay defence and limited troubleshooting | Remove inactive raw tokens; purge expired/revoked rows or retain minimal deny metadata only if needed | Security must establish minimum technical necessity and period. Expiry/revocation is NOT record deletion; no purge implemented. |
| Backups, logs, SMTP/storage/payment providers | Copies of any above, including metadata outside this database | Recovery, infrastructure operation and legitimate provider duties | Provider deletion requests, bounded backup expiry, deletion replay after restores | Management/counsel and vendors must confirm locations, contracts, periods and recovery process. Unverified. |

Management/legal approval must identify the responsible entity and applicable
jurisdictions, purpose/lawful basis for each category, minimum fields, start event,
maximum period, hold exceptions, access restrictions, purge/anonymization method,
backups/providers, owner and review date. Approving wording alone does not create
an enforceable retention process. Do not claim legal compliance based on a
disclosure that retention is indefinite.

Relevant primary guidance, reviewed 2026-10-25:

- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111): associated data deletion, justified retention disclosures, provider copies and reasonably prompt fulfilment.
- [Benin APDP retention guidance](https://archive.apdp.bj/wp-content/uploads/2022/12/APDP-DPDP-_-ROLES-ET-MISE-EN-PLACE-NOVOTEL-21122022.pdf): determine purpose-specific limited retention; archive/delete/anonymize when the purpose ends. Counsel must confirm applicability and current requirements.
- [Nigeria NDPC privacy principles](https://ndpc.gov.ng/our-data-privacy-policy/): purpose limitation, minimization and retention no longer than needed for the lawful basis. This is not a Beninfy-specific statutory retention schedule.

## Public disclosure review

EN/FR copy and privacy retention section explain independent web ownership proof,
actual in-app navigation, immediate access loss, delayed worker eligibility,
deleted vs retained categories, absence of established retained-data periods,
avatar failure limitations and official support. They make no immediate total
erasure or guaranteed restoration promise. Support is support@beninfy.com and
the existing official WhatsApp link. The local disclosure is factually candid but
not approved as a final retention policy. Direct public GET verification returned
200 for `/en/privacy`; its current retention section states broad service,
accounting/legal, dispute and operational purposes without fixed periods.
`/delete-account` redirected to `/en/delete-account` and returned 404. The local
page has not been deployed. No published deletion-completion promise was added.

## Validation

All DB tests use disposable localhost PostgreSQL and synthetic fixture accounts.
The final full backend fixture was created fresh, with the historical Tour SQL
loaded BEFORE the commercial migration as required by the repository runbook.

- Existing/new web deletion checks: **13 passed**. Mobile password and Google
  checks now also assert the same 30-day scheduled interval; Google mobile
  session revocation is explicitly asserted.
- New worker lifecycle/security checks: **4 passed, 1 failing assertion plus its
  parent suite**. Auth, due eligibility, ordinary reruns, restoration before
  selection and retry after DB failure pass. The restored-account data-loss race
  fails deterministically; the safety assertion is retained, not weakened.
- Focused combined run: **19 reported tests, 17 pass, 2 fail, 0 skipped**.
- Complete non-HTTP backend files: **404 reported tests, 400 pass, 4 fail,
  0 skipped**. Failures are two assertions plus their parent suites: the new
  worker race and existing `explicit Ride checkout cancellation retains payment
  and settlement wins races`. The latter recurred on both initial and fresh-DB
  runs: SQLSTATE 40001 escapes `paymentSettlement.ts` from the raw row-lock query;
  its catch only handles Prisma P2002/P2034. No payment implementation was changed.
- The previously intermittent push concurrent-event test **passed in both full
  runs**; no push test or implementation was weakened to obtain a pass.
- Local HTTP Admin authorization/integration checks: **6 passed**. EN/FR real
  browser/SMTP deletion and scoped axe accessibility test: **1 passed** on final
  run, including invalidation of an existing website session and blocked re-login.
  An initial browser timeout led to strengthening the fixture email parser to
  extract the verification sentence rather than arbitrary eight-digit MIME-header
  strings, and asserting the actual confirmation HTTP 200 response. The page/API
  were not changed. Thus every backend test file was executed; HTTP/browser files
  used the localhost production server, separately from the other files.
- `tsc --noEmit`: **PASS**, including final test changes.
- Focused implementation/test ESLint: **PASS**. Whole-repository `npm run lint`:
  **FAIL, 19 errors and 3 warnings**. Errors are in unchanged `prisma.config.js`,
  `scripts/check_google_users.js`, `scripts/fix_google_roles.js`,
  `scripts/inspect_emails.js`, `scripts/set_role.js` (CommonJS import rule), and
  `src/hooks/useRoutePriceOverrides.ts` (synchronous setState in effect).
- `npm run build`: **PASS**, with all three Prisma connection variables explicitly
  bound to the disposable local DB. No pending local migrations at build time.
- `git diff --check`: **PASS**.

Logs are local under `node_modules/.cache/dispatch-db/deletion-readiness-*`.
The local PostgreSQL/server fixtures are stopped after validation. No real
Customer deletion, Production migration, notification or worker call was made.

## Remaining release blockers

1. Resolve and rerun the deterministic worker/restoration safety regression.
2. Verify/configure an authenticated recurring anonymization schedule with
   successful HTTP/completion evidence, backlog monitoring, alerts and ownership.
3. Provide durable avatar cleanup recovery; close mobile/worker audit gaps.
4. Obtain category-specific management/legal retention approval, implement the
   approved retention/minimization rules and publish matching EN/FR disclosures.
5. Resolve the recurring payment race and repository ESLint failures; all required
   release tests must pass. This review does not change unrelated payment code.
6. Review the final release against current Production (which differs from local
   HEAD), then obtain explicit deployment authorization and verify the public URL.
