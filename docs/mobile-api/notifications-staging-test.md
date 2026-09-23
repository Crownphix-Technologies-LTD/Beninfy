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

## Later staging physical acceptance — not performed by this task

Requires explicit staging configuration and the Customer Flutter integration.
Use the same Firebase project as both Customer platform builds, server-only FCM
credentials, valid iOS APNs configuration and the authenticated worker running
once per minute. See [server setup and payload contract](./notifications.md).

On a real Android and iPhone, verify foreground, background and terminated-app
reception; notification permission denied/allowed; tapping each whitelisted Ride
and Tour type; fetching current authoritative detail; EN/FR copy; token refresh;
multiple devices; and A → logout → B isolation on one installation.

Provider acceptance is not physical-delivery evidence. Record platform, build,
notification ID, receive/tap result and time without recording raw tokens or
credentials. Already-submitted FCM/APNs messages cannot be recalled after logout;
the backend prevents further intentional dispatch after revocation completes.

No production deployment, credential configuration, live sends or physical
acceptance are authorized by the current implementation task.
