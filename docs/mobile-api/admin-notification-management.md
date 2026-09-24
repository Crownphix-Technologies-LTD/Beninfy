# Admin Notification Management

## Access and workflow

`/admin/notifications` uses the existing localized Backoffice layout and `users`
permission (Admin and Super Admin only). Every API action also checks the current
user's database role and active-account status. Mutations require same-origin
requests and use the existing per-actor rate limiter (20 requests/minute).

1. Choose an individual Customer/Driver using name/email search, or All Customers/All Drivers.
2. Enter plain-text EN and FR titles (1–100 characters) and messages (1–1,000).
3. Review the server-created preview: intended recipient/audience, recipient count,
   active push-capable devices and both translations. Preview expires after ten minutes.
4. Broadcasts require typing the exact phrase, e.g. `Send to 1,248 Customers`.
5. Confirmation persists inbox notifications and pending device deliveries. It never
   calls FCM or the notification worker. Refresh history/details to observe delivery.

Inactive/deleting/anonymized accounts are excluded. Drivers require an existing
Driver user account; a fleet-only Driver record is not a notification recipient.
Accounts without eligible devices still receive their persistent inbox notification.

## Persistence, concurrency and limits

The additive `20260924090000_admin_notification_management` migration introduces
`AdminNotificationCampaign` (immutable bilingual content, actor, audience and preview
snapshot) and an optional indexed `Notification.campaignId`. Existing notifications
remain valid. Production migration/deployment are separate review steps.

A client request UUID, scoped to the actor, deduplicates preview creation. A database
lock serializes confirmation. Concurrent/retried confirmations of the same preview
return the existing campaign; changed content requires a new preview. The server
reselects recipients and device eligibility and compares membership hashes at
confirmation. A change rejects the stale preview, including same-count membership
changes. Browser-supplied counts/recipient lists are rejected.

Maximum 5,000 recipients and 20,000 eligible devices per campaign. Recipient inserts
use batches of 250; delivery inserts use batches of 500, within one bounded database
transaction. Oversized audiences are rejected before any notification is created.
The mandatory `notification.queued` AuditLog is in that same transaction and records
actor, timestamp, campaign, audience, recipient/count and queued result. If any
insert or audit fails, the entire enqueue rolls back. Provider failure occurs later
and cannot erase the inbox or enqueue audit. Rejected HTTP send attempts are logged
through the existing audit facility.

The worker retains its existing ownership/session checks, row locks, localization,
invalid-token cleanup and retry limits. Pre-created pending delivery rows remain
pending when its time budget expires. Provider success means provider acceptance,
not proof that a human saw the message.

## Mobile contract

For BOTH Customer and Driver, general announcements use the FCM data object:

```json
{"version":"1","type":"admin.message","notificationId":"<persisted-notification-id>"}
```

There is no entity type, entity ID, Ride/Tour ID, URL or fabricated destination.
FCM notification title/body uses each active device's registered EN/FR language.
The existing REST inbox retains its shape and history; its localized title/body
uses current user locale, falling back to the latest eligible device language and
then English. The persisted payload is `{ "version": 1, "type": "admin.message" }`.

Mobile clients should display `admin.message` and open the existing inbox on tap,
or safely open the app when inbox navigation is unavailable. No Flutter source is
present/changed here: actual Customer/Driver tap handling must be verified with
those apps before release certification. Existing Ride/Tour routing is unchanged.

## Scheduling and physical testing boundary

No new Vercel cron is registered. The payment cron stays `0 3 * * *`.
A recurring authenticated notification worker schedule remains a separate production
certification requirement. The Admin screen queues work normally; it does not trigger
a worker run. An authorized manual invocation of the existing worker is sufficient
for an initial physical test, after checking its GLOBAL queue for unintended Customer
or Driver recipients. A small worker batch is not a recipient filter.

No production send, worker invocation, credential changes or deployment is part of
this implementation. Do not create production test notifications automatically.

## Local validation

Use a disposable localhost PostgreSQL database whose name starts with
`beninfy_dispatch_test`. Set `DATABASE_URL`, `DIRECT_URL`, `PRISMA_MIGRATE_URL` and
`ADMIN_NOTIFICATION_TEST_DATABASE_URL` to that local database; never use Production.

- `npx prisma migrate deploy` (local test database only)
- `npx tsx --test --test-concurrency=1 tests/admin-notifications.test.ts tests/customer-push.test.ts tests/customer-push-database.test.ts`
  (also set `CUSTOMER_PUSH_TEST_DATABASE_URL` for the push integration suite)
- `npx tsc --noEmit`
- ESLint on affected files; `git diff --check`
- `npm run build` with all three database URL variables pinned to localhost

Integration tests use synthetic identities and injected mock providers, and block
live provider fetches. No real notifications are sent.

For the real HTTP checks, start the completed local production build on
`http://127.0.0.1:3107` with the same disposable `DATABASE_URL`,
`PUSH_PROVIDER=disabled`, `AUTH_URL=http://127.0.0.1:3107` and the synthetic fixture
`AUTH_SECRET=local-notification-http-fixture-only`. Set
`ADMIN_NOTIFICATION_TEST_BASE_URL=http://127.0.0.1:3107` and run
`npx tsx --test tests/admin-notifications-http.test.ts`.
This fixture secret is deliberately public test material, never a Production value.
The HTTP suite creates/removes synthetic local accounts and queues inbox-only local
fixtures; it never invokes the worker. It covers unauthenticated/insufficient-role
access on every new API route, cross-origin rejection, recipient search, confirmation
retry, rejected-send audit, body limits, markup validation and rendered Admin access.
