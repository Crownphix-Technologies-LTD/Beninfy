# Account deletion worker — proposed operations, not activated

Endpoint: authenticated POST `/api/workers/accounts/anonymize?take=25`.
WORKER_SECRET remains required (CRON_SECRET fallback only when unset), using
Bearer or x-beninfy-worker-secret. No unauthenticated or GET processing is added.

## Scheduling evidence and proposed cadence

The reviewed Production Vercel project has only payment cron `0 3 * * *`.
Do not alter it or add a Vercel per-minute cron on Hobby. The last checked worker
log window showed no anonymization invocations. Supabase connector discovery now
works for the available accounts, but none of the returned projects could be
verified as Beninfy's Production project. No Beninfy cron/job/HTTP-response query could be run; an existing external
account-deletion trigger is **UNVERIFIED**, not assumed absent.

Propose reusing existing Supabase pg_cron + pg_net + Vault (already used for push):
every **5 minutes**, POST the endpoint with take=25, HTTP timeout 55 seconds.
Use a Vault reference to the existing WORKER_SECRET; never embed a credential in
cron SQL or logs. Suggested job name: `beninfy-account-anonymization`.
No new paid service is needed; existing DB/network/function usage still applies.
At most 25 account candidates and 25 cleanup candidates are selected per run;
a shared 45-second work budget stops starting new work and leaves it for the next
run. Endpoint maxDuration is 60 seconds. Completion lag also depends on backlog.

**No activation script has been executed or automatic job created.** After
explicit approval: verify no existing equivalent job, verify schema/secret,
register the named job, then inspect its HTTP response and worker metrics.
`account-deletion-schedule-verification.sql` provides read-only discovery.
Successful cron SQL dispatch does not prove successful HTTP/cleanup processing.
See [Supabase Cron](https://supabase.com/docs/guides/cron) for job/run metadata.

## Concurrency and recovery

Request scheduling, restoration and anonymization lock User first. Eligibility is
rechecked under the lock before child deletion. Restoration winning the lock
preserves data; anonymization winning commits first and subsequent restoration
returns not pending. One account's failure rolls back and does not abort later
accounts in the selected batch. Retry on a later invocation; no raw exception is
logged. A large persistent failure backlog still requires operator intervention.

Avatar cleanup outbox creation, profile anonymization and completion audit commit
together. A unique User key prevents duplicate jobs; User deletion is RESTRICTed
while cleanup evidence exists. No external avatar DELETE is made in this commit.
Cleanup locks its outbox row using SKIP LOCKED and verifies committed anonymized
state. The storage call has a 5-second timeout and stays within a 10-second DB
transaction. Concurrent calls skip the locked job. A crash after external DELETE
but before DB commit retries that DELETE safely (404 counts as success). This is
idempotent cleanup, not a claim of exactly-once external requests.

Failures retain the URL and increment attempts, with 5/10/20/40/80/160/320-minute
delays (backoff is capped at 24 hours). At recorded attempt 8 the job is blocked for review,
never silently discarded. Bad/missing storage configuration also remains retryable.
DB rollback does not commit an attempt increment; that work remains pending and
the invocation reports failure. Monitoring must catch repeated DB/audit failures;
the eight-attempt limit is not an exactly-once bound across crashes.
Only the owning avatar path can be removed; provider-hosted Google images are
skipped without deleting external data. Storage-target mismatches remain unresolved.
Success clears the retained URL and writes a minimal cleanup audit. No provider
response text, URLs, secrets or Customer identifiers appear in worker summaries.

After repairing a blocked cause, an authorized operator may requeue that specific
job under a separate approved operation after checking the User remains anonymized.
Preserve the original target; audit any reset. There is no public requeue API.
Historical cleanup failures from before this migration cannot be reconstructed
after their avatar URL was erased; reconcile them with authorized storage records.

## Monitoring contract

Authenticated response/log contains runId, ok, eligibleBefore, checked, processed,
failed, skipped, cleanup checked/succeeded/failed/blocked/skipped, plus backlog:
eligible, oldestOverdueAt, retryBacklog, blocked, oldestCleanupAt.
Only counts, timestamps, fixed categories and random invocation IDs are emitted.
Start/completion/failure logs make interrupted runs detectable. DB/request failure
returns 503; partial failure or blocked cleanup backlog also returns 503. Invalid
batch is 400; missing/wrong auth is 401; unconfigured auth is 503. Monitoring must
inspect remaining backlog even on HTTP 200.

Proposed alert thresholds (not enabled):

- No completed invocation in 15 minutes: page backend on-call.
- Two consecutive non-2xx runs, or any blocked cleanup: page backend on-call.
- Oldest eligible request overdue more than 30 minutes: warn; over 2 hours: page.
- Oldest unresolved avatar cleanup older than 24 hours: page.
- Retry backlog rises for three runs: investigate provider/configuration/capacity.

Proposed responder: Beninfy backend/infrastructure on-call; escalation to privacy
operations owner for overdue deletion. Management must name actual people, alert
destination and coverage before enabling production scheduling. No alert service
or responder acknowledgement has been verified. Restrict raw outbox access to
authorized backend/operations roles; RLS grants no anon/authenticated access.
