# Mobile Notifications / Customer Push Contract

## Existing architecture and this change

The existing `Notification` table and authenticated inbox/read APIs remain the
notification-history source of truth. `PushDevice` stores registrations and
`NotificationDelivery` records per-device attempts. The existing FCM HTTP v1
adapter, EN/FR catalog, shared token API and secret-protected delivery worker are
extended; no second inbox, Firebase provider, queue or app repository is added.

Previously delivery was started in an unawaited promise after persistence, device
uniqueness was user-scoped, logout did not clean up registrations, concurrent
workers could send twice, and Tour events were absent. Delivery now runs through
the durable worker, with session/ownership checks and serialized device sends.

## Customer installation API

All requests require `Authorization: Bearer <customer-mobile-access-token>`.
User identity and `appType=customer` are derived on the server. Driver principals
are rejected. No GET/list endpoint exists for installations.

### Register or refresh

`POST /api/mobile/v1/customer/push-tokens`

```json
{
  "token": "FCM-registration-token-from-the-Customer-app",
  "platform": "android",
  "locale": "fr",
  "installationId": "persistent-random-installation-id"
}
```

- `token`: required FCM registration token on **both Android and iOS**, 20–4096
  characters, no whitespace. Do not send a raw APNs token.
- `platform`: required `android` or `ios`.
- `installationId`: required stable installation identity, 1–120 characters from
  `A-Z a-z 0-9 . _ : -`. Generate once per installation, not per login.
- `locale`: optional, 2–16 characters. `fr`/`fr-*` normalize to `fr`; otherwise `en`.
- Unknown properties, including `userId`, `sessionId`, and `appType`, are rejected.

HTTP 200, including idempotent registration:

```json
{
  "installation": {
    "id": "backend-registration-id",
    "installationId": "persistent-random-installation-id",
    "platform": "android",
    "appType": "customer",
    "locale": "fr",
    "active": true,
    "lastSeenAt": "2026-09-23T12:00:00.000Z"
  }
}
```

No raw token, user ID or session ID is returned. Register after login and whenever
FCM refreshes the token or the selected locale changes. Registering the same
installation updates its existing row; token/installation collisions reconcile
to one canonical row. Registration is limited to 20 attempts per 15 minutes per
Customer/IP.

### Unregister

`DELETE /api/mobile/v1/customer/push-tokens/:installationId`

No request body. HTTP 200:

```json
{ "ok": true }
```

Idempotent: missing, already revoked, and another user's installation have the
same response. The mutation always includes the authenticated user ownership
filter. Call before discarding authentication during logout. The existing
`POST /api/mobile/v1/auth/logout` also revokes devices bound to that refresh-token
session; logout-all revokes all of the user's registrations and sessions.

Common errors use the existing `{ "error": { "code", "message", "details"? } }`
envelope: 401 UNAUTHENTICATED, 403 FORBIDDEN, 400 VALIDATION_ERROR or
PUSH_TOKEN_INVALID, 429 RATE_LIMITED, 500 INTERNAL_ERROR. No provider/token secrets
are included in errors.

### Compatibility and ownership

The shared `POST/DELETE /api/mobile/v1/devices/push-token` remains available with
its existing `appType`, `deviceId`, `language` representation. Driver payload
routing stays unchanged and no Driver app changes are required. Shared DELETE
is now idempotent (`revoked: 0` for no matching active registration).

Migration `20260923120000_customer_push_session_ownership` adds nullable
`PushDevice.sessionId` and its index. Existing `deviceId`/`language` represent
installation ID/locale; all other required fields already exist. Partial unique
indexes enforce one active row per token hash globally and per app/installation.
The migration revokes older ambiguous duplicates before adding these indexes.
Delivery/history rows are retained; reconciliation may detach a superseded
registration from historical delivery records using the existing SetNull FK.

New registrations bind the authenticated mobile session. Legacy Customer rows
without a bound session must re-register before delivery. Session expiry,
revocation, disabled/deleting accounts, and account reassignment stop delivery.
A different token registered by User B for User A's installation also revokes A's
old association. Invalid-token cleanup cannot accidentally invalidate a refreshed
token while an old provider request is running.

## Stable Customer FCM payload

The FCM `message.notification` contains localized `title` and `body`.
`message.data` contains **only these five string fields**:

```json
{
  "version": "1",
  "type": "trip.driver_assigned",
  "entityType": "ride",
  "entityId": "booking-id",
  "notificationId": "persistent-notification-id"
}
```

`entityId` is Booking.id for `ride`, TourBooking.id for `tour`. Flutter routes
using a local whitelist and fetches authoritative detail after opening. Never
interpret notification text as business state. No URL, auth token, amount,
payment credentials, passenger details or arbitrary metadata is sent.

Supported Customer type whitelist:

| Entity          | Types                                                                                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ride            | `booking.confirmed`, `payment.confirmed`, `payment.failed`, `trip.driver_assigned`, `trip.assignment_changed`, `trip.driver_en_route`, `trip.driver_arrived`, `trip.started`, `trip.completed`, `trip.cancelled` |
| Ride (existing) | `chat.new_message`, `payment_resolution.under_review`, `refund.approved`, `refund.processing`, `refund.completed`, `refund.rejected`                                                                             |
| Tour            | `tour.booking_confirmed`, `tour.payment_confirmed`, `tour.cancelled`, `tour.status_updated`                                                                                                                      |

The inbox stays at `GET /api/mobile/v1/notifications` and
`POST /api/mobile/v1/notifications/:id/read`. Existing persisted fields remain;
new Customer payloads add `entityType`/`entityId`. Inbox language prefers User.locale,
then the latest device language, then English. Push copy is rendered per device
locale. Existing EN/FR templates are reused; four Tour EN/FR templates are added
explicitly in the same catalog, with minimal lock-screen text.

## Events and isolation

Ride payment settlement queues `payment.confirmed` (which also communicates
booking confirmation), deduped by Payment.id. Operations confirmation queues
`booking.confirmed`. Assignment queues `trip.driver_assigned`, removal/update
`trip.assignment_changed`. Existing authoritative en-route/arrived/start/complete
transitions remain wired. Customer/Operations cancellation uses one booking-wide
`trip.cancelled` key, avoiding an alert per leg of the same cancellation.

Tour paid settlement queues `tour.payment_confirmed`; zero-payable confirmation
queues `tour.booking_confirmed`. Both use their actual authoritative transitions,
not initial pending/quote creation. Cancellation queues `tour.cancelled`.
Assignment/pickup changes and driver en-route/arrived/day-started/day-completed
transitions queue `tour.status_updated`. No event is invented for unsupported
states. Repeated domain handling uses stable unique dedupe keys.

Business transaction commits → notification persistence → worker delivery.
No FCM call runs in a business transaction. Notification persistence failure is
sanitized and cannot change a completed business result. Payment amounts,
settlement decisions, cancellation rules, Ride pricing and the Tour commercial
model are unchanged. A process crash between business commit and notification
creation remains a recovery limitation of this post-commit pattern.

## Delivery worker and guarantees

Existing `GET/POST /api/workers/notifications/deliver`, protected by WORKER_SECRET
or CRON_SECRET. POST accepts optional `{ "take": 50 }` (clamped to 1–200).
Response: `{ "ok": true, "result": { "checked": 1, "processed": 1 } }`.
The checked/processed counts mean queue work, **not device delivery receipts**.

The notification worker is deliberately not registered in Vercel cron, so the
configuration remains compatible with Hobby. The payment cron is unchanged.
Automatic Git deployments are disabled only for feature/mobile-production-completion
so pushing this preparation change cannot deploy or run build-time migrations.
An explicit deployment still requires separate authorization; main is unaffected.
For the controlled Android physical test, manually invoke this authenticated
worker after a read-only queue safety check and separate send authorization.
See [the test procedure](./notifications-staging-test.md#controlled-android-test-in-the-existing-environment).
Before final production push certification, a recurring authenticated worker
solution (normally every minute) must be configured and verified. No external
scheduler is implemented here. Without invocation, inbox notifications remain
pending and no push is sent.

Worker sends are serialized on each registration row, rechecking ownership,
session, account status and prior delivery before contacting FCM. Registration,
logout/revocation and account transfer wait for an in-flight send to finish.
Once revocation/transfer returns, later backend dispatch cannot target that
installation for the old user. An already-submitted push cannot be recalled from
FCM/APNs. HTTP calls are bounded; a send holds the device lock for at most the
transaction timeout (12 seconds). Worker runs have a 45-second work budget.

- `pending`: durable notification awaiting work.
- `sent`: provider accepted the request; **not proof the phone displayed it**.
- `failed`: transient failure; up to three attempts, five minutes between attempts.
- `blocked`: configuration failure; five-minute rechecks without consuming transient retries.
- `invalid_token`: token-specific rejection; registration invalidated.
- `skipped_no_device`: no eligible installation; inbox remains accessible.
- `skipped`: unsupported/invalid routing payload, or a retired retry after device removal/revocation/transfer; not sent.

One device failure does not prevent attempts to other devices. Successful devices
are not retried when another device fails. FCM UNREGISTERED and token-specific
INVALID_ARGUMENT trigger cleanup. Generic 400/404, project mismatch and APNs
credential errors do not invalidate valid tokens. No age-based guessed token
expiry is applied; revoked/expired sessions and FCM feedback determine eligibility.

FCM is not exactly-once: an accepted send followed by process/DB failure, or an
ambiguous network timeout, can be retried. Concurrent workers and repeated domain
handling do not intentionally send duplicates. The persistent notification ID
remains stable for reconciling with the inbox.

Logs contain only event/category/status and internal IDs: registered,
registration_failed, revoked, revocation_failed, persisted, persistence_failed,
dispatch_attempted, dispatch_result, invalid_token_cleanup, dispatch_failed.
Raw device tokens, exception messages, credentials and payment values are excluded.

## Server configuration: external work still required

Implemented provider: **FCM HTTP v1**, reusing the existing server service-account
JWT/OAuth adapter. No Firebase Admin dependency is needed; ADC is not used by this
adapter. Server environment variables (names only):

- `PUSH_PROVIDER`: `fcm` for real delivery; `disabled`/`mock` for development/testing.
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (PEM; escaped newlines supported)
- `WORKER_SECRET` or `CRON_SECRET` for the existing worker. Vercel cron uses
  CRON_SECRET; leave WORKER_SECRET unset or identical, since it takes precedence.

No Firebase project ID has been supplied/verified for this task. The configured
project must be the Customer Android/iOS app's Firebase project. Enable FCM HTTP
v1, provision a server-only service account authorized to send to that project,
and place its credentials in the deployment secret store. Never use NEXT_PUBLIC
variables or ship service-account credentials to Flutter. The iOS app's APNs
key/certificate and bundle registration must be configured in that Firebase
project; Android must use the matching Firebase application configuration.

Production rejects mock success. Missing/disabled credentials create blocked
attempts rather than claiming delivery. Development can use explicit
PUSH_PROVIDER=disabled or mock. Automated tests inject/mock the provider and all
OAuth/FCM fetches; CI never needs real Firebase credentials or live FCM calls.

References: [FCM HTTP v1 setup](https://firebase.google.com/docs/cloud-messaging/send/v1-api),
[FCM error codes](https://firebase.google.com/docs/cloud-messaging/error-codes).

## Validation / review status

Focused tests: `tests/customer-push.test.ts`, `tests/customer-push-database.test.ts`.
For the database suite, set DATABASE_URL and CUSTOMER_PUSH_TEST_DATABASE_URL to the
same disposable localhost database named beninfy_dispatch_test... or
beninfy_tour_test..., with all existing migrations applied. Run:

`node --import tsx --test tests/customer-push.test.ts tests/customer-push-database.test.ts`

The broader suite uses the existing DRIVER_SEARCH_TEST_DATABASE_URL and
TOUR_ITINERARY_TEST_DATABASE_URL opt-ins. Run database suites serially because
some existing Tour fixtures share canonical IDs. Prepare a fresh database with
the historical fixture loaded before the commercial migration, as described in
[tour-commercial-model.md](./tour-commercial-model.md#validation), before running:

`node --import tsx --test --test-concurrency=1 tests/*.test.ts`

**Implemented in code:** Customer integration contract, persistence/worker delivery,
FCM HTTP v1, ownership/session safety, localization, Ride/Tour hooks and mocked tests.
**External configuration required:** project/service-account/APNs setup, worker
schedule, Customer Flutter integration/permissions, and physical Android/iPhone
foreground/background/terminated/account-switch validation. Tests do not certify
production or physical push delivery. No deployment or push is part of this change.

### Local validation recorded 2026-09-23

- Focused push tests: 22 passed, zero failed/skipped; FCM/OAuth fully mocked.
- Full backend suite: 348 reported tests, 346 passed, two failed, zero skipped.
  The two failures are one existing Ride checkout cancellation/payment-settlement
  concurrency scenario and its parent test. PostgreSQL reports serialization
  error 40001 at the Booking row lock. Reproduced against an isolated unchanged
  archive of HEAD `0b2a512913f5970be5a7d7f5698acd5f53b00052`; payment/cancellation
  behavior is deliberately unchanged by this push task.
- TypeScript, changed-file ESLint, Prisma validation and local Next production
  build passed. The new migration applied successfully to disposable PostgreSQL.
- No real Firebase sends, physical phone validation, commit, push or deployment.
