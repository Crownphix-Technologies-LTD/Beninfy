# Provisional retention enforcement plan — 25 October 2026

**PLANNING ONLY. No application code, schema, migration, worker or purge rule is
implemented or activated by this document.** The frozen engineering RC remains
`8f870542a3f057763d008fac233a238fe52d1876`. Build future enforcement on a separate
reviewed branch with its own migrations, tests and release authorization.

Authority: [management record](./account-deletion-management-approval.md).
Exact periods and qualifications: the nine unchanged source rows in
[the retention matrix](./account-deletion-retention-approval.md). Those rows are the
canonical provisional schedule; this plan adds no period and resolves no missing
trigger by assumption. Financial-ledger duration remains **TBD**.

## Current behavior and required boundary

The RC disables access after verified confirmation, applies the approved 30-day
grace, and atomically anonymizes eligible profiles with lifecycle audits and an
avatar-cleanup outbox. It removes saved places, travel preferences, Ride reviews,
verification/reset records, linked OAuth credentials and web sessions. It revokes
mobile/push registrations but retains their rows, including inactive raw push
tokens. It does not implement scheduled purging of the nine retained categories.

Keep profile deletion separate from record-specific expiry. Do not replace a
trip-completion, reconciliation or case-closure trigger with account anonymization.
Do not silently apply Customer policy to all Driver accounts or unrelated parties.
The account grace does not become an additional delay on every record's expiry.
How ordinary record expiry interacts with restored accounts and existing records
must be agreed before activating rules; restoration cannot resurrect erased data.

## 1. Resolve policy inputs before coding enforcement

- Record policy version, management adoption date, final reviewer, evidence,
  field inventory, purpose, authoritative trigger, target, hold exceptions and
  responsible operator for every category. Provisional adoption is not legal sign-off.
- Confirm scope: only deletion-requested Customers, all Customers' expired records,
  or another explicitly approved scope; define shared-record handling and historic
  backfill. Do not infer this from the mere existence of a retention period.
- Resolve missing/ambiguous anchors: security diagnostics' 90 days; revoked-device
  metadata's 30 days; the precise final-reconciliation and case-closure events;
  provider-request "processing"; what constitutes a terminal delivery. Do not use
  mutable `updatedAt` as a substitute for a missing authoritative event timestamp.
- Define calendar-month arithmetic for the existing 24-month target, time-zone
  normalization, boundary inclusivity and reopened-trip/case behavior. Do not
  invent durations or erase records whose authoritative deadline is unknown.
- Finance/legal must determine ledger duration, required fields, chargeback/claims
  requirements and provider evidence. Report unresolved classification as blocked
  work with an owner; it is not approval for indefinite retention.

## 2. Database and application changes required

These are proposed changes for review, not an approved DDL design. Inspect all
copies, JSON snapshots and external objects before finalizing each migration.

| Matrix category | Existing data locations / dependencies | Required enforcement changes |
| --- | --- | --- |
| 1. Booking/passenger/travel/location | `Booking` passenger fields and `travelers` JSON; `BookingLeg`; `TourBooking` pickup/custom itinerary/commercial snapshots; `TourBookingDay` and linked journey/location history | Classify personal fields, including nested snapshots and cached copies. Add reliable expiry/redaction markers where needed; redact approved identity/contact/document/precise-location fields after the matrix trigger. Preserve service totals, statuses and approved financial references. Never mutate operational snapshot content while trips remain active; privacy redaction after expiry needs a separate audited pathway. |
| 2. Payment/reconciliation | `Payment`, checkout URL/access code, provider metadata, `tourPricingSnapshot`; linked booking commercial data | Add a reliable final-reconciliation anchor if absent. Separate transient checkout credentials/redundant PII from immutable ledger evidence. Purge only the approved non-ledger fields at their matrix deadline. No timed ledger purge while duration is TBD; preserve amount/currency/status/reference, settlement deduplication and required evidence. |
| 3. Refund/dispute/support | `PaymentResolution` narratives/status/timestamps; referenced support evidence and attachments, including copies outside the database | Identify authoritative final closure and reopen events; model missing support evidence references. Store only scoped evidence under the approved case policy, redact narratives/remove attachments at expiry, preserve minimal required financial evidence. Resolve cascades before any parent deletion; never invoke a refund or settlement from cleanup. |
| 4. Audit/consent/deletion | `AuditLog` actor email/IP/JSON metadata; `User` consent fields and deletion history | Classify events into diagnostics versus minimal decision evidence; add policy/expiry metadata if needed. Remove personal metadata, expire diagnostics and retain only approved pseudonymous proof. Existing lifecycle audit atomicity stays intact. Define audit-of-purge evidence without retaining a new copy of erased personal data indefinitely. |
| 5. Chat | `TripConversation`, `ChatMessage`, sender links and message bodies | Derive closure from the approved trip event; conversation closure alone may not mean trip completion. Delete ordinary text/identifying links or FK-safe rows at expiry. Isolate specifically selected case evidence with its own approved expiry. Preserve other participants' legitimate access and avoid deleting unrelated Driver history. |
| 6. Notifications | `Notification` content/payload/user links, `NotificationDelivery`, `PushDevice` references, `AdminNotificationCampaign` content and recipient metadata | Establish immutable terminal-delivery time where required. Purge content and diagnostics on their separate matrix clocks; handle campaign copies as well as inbox rows. Preserve deduplication safety without retaining unnecessary PII: review producer replay windows and minimal tombstone needs. Define treatment of still-pending deliveries at content expiry instead of silently dropping legitimate delivery work. No new dedupe retention period is assumed. |
| 7. Tour feedback | `TourFeedback`, `TourDriverFeedback`, `TourFeedbackDay`; required IDs and RESTRICT foreign keys; free text/risk flags | Separate ordinary quality feedback from selected safety-case evidence. Design irreversible aggregates without unique trip/day/customer linkage or revealing small groups. Redact comments and remove identifying relationships after approved expiry. Review schema changes needed for required relations/RESTRICT constraints; do not merely hash linkable IDs and call the result anonymous. |
| 8. Revoked sessions/devices | `MobileSession` refresh hash/expiry/revocation; `PushDevice` non-null token/hash and unique keys; delivery SetNull relation | Make raw-token erasure schema-compatible and safe for worker/provider selection, idempotent registration and token rotation. Recheck revocation under lock so an active or reassigned device is not erased. Purge revoked metadata at the agreed trigger; preserve required refresh revocation evidence through the existing expiry-based target. No fabricated common token value that breaks uniqueness. Preserve session invalidation and account isolation. |
| 9. Backups/external providers | Supabase database backups, avatar Storage objects, off-site copies, SMTP/payment/other processor copies | No database DELETE can erase historical snapshots or processor copies. Inventory verified capabilities/contracts and copy locations; create minimal processor-request/completion evidence and recovery-deletion replay controls. Track requests and exceptions separately from local completion. The conditional backup horizon and provider targets remain exactly those in the matrix; verify feasibility before committing publicly. |

Schema work must be separately reviewed and migrated additively where possible:
policy/trigger/expiry metadata, private hold records, minimal cleanup-job evidence,
and indexes supporting due-work selection. Any field nullability, relation or
constraint alteration requires explicit compatibility review. Never use `db push`,
drop business tables, or cascade-delete a User to implement this policy.

## 3. Scoped legal holds and payment evidence

Propose a private hold registry with case/reference, category, exact record/field
scope, documented purpose/basis, named owner, authorization, start time, review
date and audited release. Hold durations/review intervals remain decisions for
legal; this plan invents none. A hold must not freeze all Customer data by default.
Unknown or expired hold decisions surface for review rather than disappearing.

Recheck both expiry and active holds inside the same transaction that redacts or
deletes. Hold creation/release and cleanup must share a documented lock order so
an approved hold cannot race with erasure. Define which action wins and audit it;
a hold created after committed erasure cannot restore the data. Release a hold
against the original retention trigger; do not silently restart the entire clock.

Before erasing linked PII, obtain finance/legal's minimum evidence decision and
preserve approved reconciliation, refund/dispute and provider proof in a restricted
store. Do not rewrite amounts, paid status, currency or settlement references.
Keep unresolved ledger duration as a visible decision gate, not a guessed default.

## 4. Execution and failure safety

Reuse the existing authenticated worker conventions, bounded transactions,
row-lock/recheck approach, atomic minimal audit and durable outbox pattern where
appropriate. Do not silently add new retention processing to the frozen worker.
Approve each new job/endpoint and its cadence separately; no new cadence is set here.

- Design a read-only dry-run mode returning aggregate due/held/blocked counts and
  policy versions, never raw PII, tokens, URLs or evidence content.
- Use indexed bounded batches, leases/locks, retryable failures and idempotent
  per-record policy-version markers. Preserve pending work through crashes.
- Perform external-object deletion after durable database intent; verify ownership,
  use bounded calls, retain failed targets securely and clear targets on success.
- Expose due/held/blocked backlogs, oldest due time, success/failure counts and
  processing run IDs. Obtain thresholds/capacity and escalation approval; do not
  present the existing avatar retry policy as an approved policy for every new job.
- No provider/payment business operation belongs in purge processing. Keep payment
  and push schedules unchanged and preserve their concurrency/deduplication rules.

## 5. Backups and third-party processors

Infrastructure/vendor owners must verify database and avatar-object backups
separately, including encrypted off-site copies, access, rotation, deletion support,
restore evidence and approved recovery objectives. Do not assume database backups
contain Storage object bytes or that an existing plan supports the provisional
35-day maximum. Resolve unsupported targets with management/legal before rollout.

For each processor, record the contact/interface, agreement, categories, request
trigger, request acknowledgement, completion evidence and documented exception.
Request/target clocks remain the matrix's 7/30-day proposals, now provisional.
Actual provider and ledger periods remain TBD; never mark a processor copy erased
solely because a local profile was anonymized.

Restore into isolation first. Replay completed deletion/redaction decisions and
revocations before restoring service, so backups cannot resurrect accounts, tokens
or erased data. Reconcile newer financial records separately; a whole-database
rollback must not overwrite intervening payments. Approve the minimal replay
evidence, its retention and access under the existing audit-policy review.

## 6. Implementation and release sequence

1. Complete field/processor inventory and resolve the policy inputs, holds, scope,
   ledger and missing triggers above with named legal/finance/operations owners.
2. Prepare a separate implementation branch and reviewed schema/worker changes;
   keep the validated RC pinned. Use synthetic fixtures only.
3. Test deadline boundaries, missing triggers, reopened cases, scoped holds in both
   lock orders, restoration, repeated/concurrent execution, partial failure, external
   success followed by DB rollback, tenant/principal isolation and no token/PII logs.
4. Test unchanged settlement/refund amounts and states, notification retries/dedupe,
   revoked-session safety, feedback FKs/aggregates and backup deletion replay.
   Run the relevant full backend, PostgreSQL, auth/mobile/push and build gates.
5. Review aggregate dry-run results and migration/backfill behavior on disposable
   data; obtain separate approval before reading/processing Production records.
6. Reconcile EN/FR wording with actual implemented capabilities and approve policy
   publication separately. Never turn future targets into present-tense promises.
7. Obtain backup, deployment, migration, alert and staged activation approvals.
   Confirm CTO officeholder/availability and privacy escalation owner; test alerts
   to info@crownphix.tech. Primary responder is Idowu James.
8. Only after authorization, activate scoped processing, verify outcomes and
   monitor backlog/holds. Rollback stops the relevant jobs, preserves audit/outbox
   evidence and cannot undo committed erasure. Google Play submission remains separate.

No step above has been executed by recording this plan.
