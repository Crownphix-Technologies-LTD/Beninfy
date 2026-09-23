# Notifications Test Plan

## Automated / local verification

Use a disposable localhost database with all migrations applied, including
`20260923120000_customer_push_session_ownership`. Never use production data.
Set DATABASE_URL and CUSTOMER_PUSH_TEST_DATABASE_URL to that same database.

Run `node --import tsx --test tests/customer-push.test.ts tests/customer-push-database.test.ts`.
Tests mock all OAuth/FCM requests and delivery providers. No live FCM calls occur.
PUSH_PROVIDER=disabled is suitable for local inbox testing. PUSH_PROVIDER=mock is
only accepted outside NODE_ENV=production; a production build with mock selected
records configuration-blocked delivery rather than fake success.

Verify:

1. Customer POST `/api/mobile/v1/customer/push-tokens` requires authentication and
   rejects userId/appType/sessionId spoofing. Responses never contain raw tokens.
2. Repeat registration, concurrent registration, token rotation and previously
   registered token/installation collisions preserve one active registration.
3. DELETE `/api/mobile/v1/customer/push-tokens/:installationId` is idempotent and
   cannot affect another account. Logout revokes the bound session's devices;
   logout-all revokes all registrations. Expired/revoked sessions cannot send.
4. User A → revoke/logout → User B on the same installation transfers ownership.
   Queued notifications for A do not target B. Repeat with a changed FCM token.
5. Concurrent workers/replayed domain events send once per successful device;
   one invalid or failing token does not block other devices. Invalid-token
   cleanup never revokes an unrelated or newly refreshed token.
6. Inbox persists independently of push; ownership and mark-read remain intact.
7. English and French devices receive their respective localized push copy.
8. Ride assignment produces `trip.driver_assigned`; existing arrived/start/
   completion/cancellation and payment confirmation events remain authoritative.
9. Tour payment/zero-payable confirmation, cancellation, assignment/pickup updates
   and actual day transitions create the documented Tour events.
10. Missing credentials leave delivery blocked. Provider failure never changes
    committed payment, booking, assignment or trip state. Logs are sanitized.
11. Worker authentication rejects missing/wrong secrets. Its counts reflect work
    processed, not proof a device displayed a notification.

## Controlled Android test in the existing environment

No separate staging environment is required for this controlled test. The
notification cron is absent from vercel.json; the worker endpoint and its secret
check remain unchanged. A recurring authenticated worker solution is required
before final production push certification. No scheduler is installed here.

### Read-only queue safety check

Run the SQL below through an authorized PostgreSQL session, after the push schema
is available. Supply psql variables test_customer_id (User.id) and
test_push_device_id (PushDevice.id, not an FCM token). Do not echo connection
strings or identifiers. If either identifier, DB access, or schema is unavailable,
report UNVERIFIED and do not invoke the worker.

This checks all due/pending notifications, including ones with no delivery row
created yet, and counts eligible notification/device pairs. It applies device,
account, session, retry and previous-delivery checks. Counts are conservative:
unsupported payloads/templates may subsequently be skipped by the worker. An
outside-recipient count therefore blocks testing even if payload validation might
later skip that record. No token or personal information is selected or returned.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10s';
WITH designated AS (
  SELECT NULLIF(:'test_customer_id', '') AS customer_id,
         NULLIF(:'test_push_device_id', '') AS device_id
), queued AS (
  SELECT n.id, n."userId", n."appType"
  FROM "Notification" n
  WHERE n."deliveryState" = 'pending' OR EXISTS (
    SELECT 1 FROM "NotificationDelivery" retry
    WHERE retry."notificationId" = n.id
      AND retry.status IN ('failed', 'blocked') AND retry.attempts < 3
      AND (retry."nextAttemptAt" IS NULL OR retry."nextAttemptAt" <= CURRENT_TIMESTAMP)
  )
), eligible AS (
  SELECT n."appType", (d.id IS NOT NULL) AS existing_delivery,
    COALESCE(n."appType" = 'customer' AND n."userId" = p.customer_id
      AND pd.id = p.device_id, false) AS designated_recipient
  FROM queued n
  JOIN "PushDevice" pd ON pd."userId" = n."userId" AND pd."appType" = n."appType"
  JOIN "User" u ON u.id = n."userId"
  LEFT JOIN "MobileSession" s ON s.id = pd."sessionId" AND s."userId" = pd."userId"
    AND s."revokedAt" IS NULL AND s."expiresAt" > CURRENT_TIMESTAMP
  LEFT JOIN "NotificationDelivery" d ON d."notificationId" = n.id AND d."pushDeviceId" = pd.id
  CROSS JOIN designated p
  WHERE pd."revokedAt" IS NULL AND pd."invalidatedAt" IS NULL
    AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL AND u."anonymizedAt" IS NULL
    AND (s.id IS NOT NULL OR (pd."sessionId" IS NULL AND pd."appType" = 'driver'))
    AND (d.id IS NULL OR (
      d.status NOT IN ('sent', 'invalid_token', 'skipped') AND d.attempts < 3
      AND (d."nextAttemptAt" IS NULL OR d."nextAttemptAt" <= CURRENT_TIMESTAMP)
    ))
)
SELECT COUNT(*) AS eligible_delivery_pairs,
  COUNT(*) FILTER (WHERE "appType" = 'customer') AS customer_delivery_pairs,
  COUNT(*) FILTER (WHERE "appType" = 'driver') AS driver_delivery_pairs,
  COUNT(*) FILTER (WHERE existing_delivery) AS eligible_existing_delivery_rows,
  COUNT(*) FILTER (WHERE NOT existing_delivery) AS eligible_not_yet_created_delivery_rows,
  COUNT(*) FILTER (WHERE NOT designated_recipient) AS outside_test_recipient_pairs,
  COALESCE(BOOL_OR(NOT designated_recipient), false) AS any_outside_test_recipient,
  (SELECT customer_id IS NOT NULL AND device_id IS NOT NULL FROM designated) AS designation_complete
FROM eligible;
ROLLBACK;
```

This is a snapshot, not a recipient lock. Recheck immediately before an authorized
send; any change in registrations/queue requires another check. If another
recipient is eligible, stop and report it. Do not delete, revoke or mutate other
users' queue/device records to make the check pass. A batch limit is not an account
filter: the worker also processes Driver deliveries.

### Manual worker invocation (requires separate send authorization)

After the queue check passes, call POST /api/workers/notifications/deliver using
Authorization: Bearer <WORKER_SECRET> from a trusted operator process. Load the
secret from secure configuration, never command-line literals or logs. Do not
call FCM directly. The existing worker must create/update NotificationDelivery
through its normal path. No invocation or live send is part of preparation.

On the Samsung, verify login, token registration, a normal Ride assignment,
persisted Notification, worker acceptance and actual receipt. Provider acceptance
alone is not physical-delivery evidence. Later certification must also cover
background/terminated reception, EN/FR, token rotation, multiple devices and
account switching. Already-submitted FCM/APNs messages cannot be recalled.
