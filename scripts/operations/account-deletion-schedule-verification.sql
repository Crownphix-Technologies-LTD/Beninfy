-- READ ONLY. Run in the Production Supabase SQL Editor to verify the existing
-- anonymization scheduler. This does not create a job or execute a worker.
-- Commands, Vault values, HTTP headers, account IDs and PII are never returned.
-- Zero rows means no directly identifiable job; wrapper-function schedulers
-- require separate inspection by an authorized operator.
SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  position('/api/workers/accounts/anonymize' in j.command) > 0 AS targets_account_worker,
  position('net.http_post' in lower(j.command)) > 0 AS uses_http_post,
  position('vault.decrypted_secrets' in lower(j.command)) > 0 AS references_vault,
  (position('authorization' in lower(j.command)) > 0
    OR position('x-beninfy-worker-secret' in lower(j.command)) > 0) AS contains_auth_header,
  count(r.runid) FILTER (WHERE r.start_time >= now() - interval '7 days') AS runs_last_7_days,
  count(r.runid) FILTER (WHERE r.start_time >= now() - interval '7 days'
    AND r.status = 'failed') AS failed_sql_runs_last_7_days,
  max(r.end_time) FILTER (WHERE r.status = 'succeeded') AS last_successful_sql_run
FROM cron.job j
LEFT JOIN cron.job_run_details r ON r.jobid = j.jobid
WHERE position('/api/workers/accounts/anonymize' in j.command) > 0
   OR j.jobname ILIKE '%anonymiz%'
   OR j.jobname ILIKE '%account%delet%'
GROUP BY j.jobid, j.jobname, j.schedule, j.active, j.command;

-- A successful cron SQL run only proves request dispatch, not worker HTTP 2xx
-- or completed cleanup. Correlate with HTTP response and application metrics.
SELECT
  count(*) AS eligible_pending_accounts,
  min("scheduledDeletionAt") AS oldest_eligible_at
FROM "User"
WHERE role = 'user'
  AND "deletionRequestedAt" IS NOT NULL
  AND "scheduledDeletionAt" <= now()
  AND "anonymizedAt" IS NULL;
