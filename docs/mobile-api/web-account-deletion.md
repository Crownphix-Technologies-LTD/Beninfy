# Public Customer account deletion — implementation review

## Status and release boundary

Implemented locally for `https://www.beninfy.com/delete-account`. The existing
locale middleware redirects this public URL to `/en/delete-account` or
`/fr/delete-account`. Neither the page nor its form requires login or the app.
No deployment, production deletion, production email, migration or worker call
is part of this implementation. Existing uncommitted Driver/push work is separate.

**Review before deployment:**

1. Approve retention periods and purposes for the retained categories below.
   The current backend and published privacy policy have no fixed periods. The
   new disclosure explicitly says this, rather than inventing statutory periods.
   This is not a claim of Google Play or legal certification.
2. Confirm the actual Production `ACCOUNT_DELETION_GRACE_DAYS` and a monitored
   recurring execution of `/api/workers/accounts/anonymize`. The worker exists;
   the checked-in Vercel schedule contains only payment reconciliation. The
   notification-delivery scheduler does not anonymize accounts. Production
   anonymization scheduling was not verified or modified in this task.
3. Confirm the existing SMTP/HMAC configuration and restricted access to the
   existing User/OtpChallenge/RateLimitBucket tables. There is no new public
   Supabase table, grant, RPC or browser database access. The connected Supabase
   tool was unavailable without a connection link ID; no Production query ran.
4. Review backup/provider retention and the operational process for failed
   avatar-object cleanup and email-inaccessible ownership recovery.
5. After approval and deployment, verify anonymous EN/FR public HTTP access,
   configured delivery of verification emails and the completion processor.

## Public API

### POST /api/account-deletion/request

JSON only, browser Origin must be `https://www.beninfy.com` or
`https://beninfy.com`; same-origin localhost is additionally supported in development.
Cross-site fetches are rejected. GET has no effect. No CORS wildcard.

Request:

```json
{"email":"customer@example.test","locale":"en"}
```

Optional `website` is a honeypot. All other fields, including `userId`, are rejected.
The response is always `202 {"ok":true,"requestId":"<random UUID>"}` for valid
requests, whether the Customer exists, is ineligible, is throttled by email, or
is an Admin/Driver. Account lookup and mail delivery occur in Next.js `after`,
after the generic response, so account existence and mail-provider latency do
not influence the response status/body/timing. No request changes account access.

Limits use existing durable PostgreSQL rate buckets:

- Request IP: 5 attempts / 15 minutes, checked before body parsing.
- Normalized email: 3 / hour, with the same public response when exceeded.
- Shared email budget: 100 / hour, also undisclosed to the caller.
- JSON body: at most 4 KiB, enforced while reading the stream.

Configuration outages return generic `503 SERVICE_UNAVAILABLE` before lookup if
SMTP is not configured. IP limit is `429 RATE_LIMITED`; malformed input is
`400 INVALID_REQUEST`; origin/content type rejection is `403 REQUEST_REJECTED`.
Responses have `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

### POST /api/account-deletion/confirm

```json
{"requestId":"<UUID from request>","code":"<8-digit email code>","confirmation":"DELETE_MY_ACCOUNT"}
```

The eight-digit cryptographically random code expires after ten minutes, has
five attempts, is bound to the Customer, original normalized email and distinct
purpose `customer_web_account_deletion`, and is stored only as an HMAC using the
existing onboarding/auth secret. No verification token goes in a URL or browser
storage. New issuance invalidates preceding unconsumed codes for that Customer.

Confirmation requires the explicit destructive-action checkbox in the UI and
the exact confirmation literal at the API. No code is consumed by GET/email
preview. Verification locks User then OtpChallenge, checks expiry/attempts,
rechecks current role/email, and atomically consumes the proof, schedules deletion,
revokes access and records a minimal audit event. A Driver-linked User, changed
email, changed role, anonymized account or incorrect purpose is rejected. Codes
cannot be replayed, and concurrent confirmations produce one accepted mutation.
Website credentials/Google sign-in and JWT session refresh now also reject
disabled, deletion-pending and anonymized accounts. Existing website sessions
lose their account identity, and a fresh login cannot bypass pending deletion.

Success: `200 {"ok":true,"deletion":{"status":"pending","requestedAt":"<ISO>",
"scheduledAt":"<ISO>","anonymizedAt":null},"sessionsRevoked":true}`.
Wrong/expired/consumed/unknown proofs: identical `400 INVALID_CODE`. IP limit:
20 / 15 minutes (`429`). Malformed payloads and spoofed IDs fail validation.
Provider exceptions, raw addresses, codes and credentials are not logged.
SMTP delivery failure invalidates its proof and logs only a fixed category;
the customer can retry subject to limits or contact official support.

## Existing Customer contract preserved

`POST /api/mobile/v1/customer/account/delete` still requires a CUSTOMER bearer
principal, completed onboarding and `confirmation=DELETE_MY_ACCOUNT`. Password
accounts require `currentPassword`. Google-only accounts require recent mobile
session activity (configured `ACCOUNT_DELETION_RECENT_SESSION_SECONDS`, default
15 minutes). Its error envelope and success response are unchanged.

The mobile and web flows share `scheduleCustomerAccountDeletion`. It disables the
account, increments sessionVersion, revokes mobile sessions and push registrations,
and schedules the existing worker. It does not mutate bookings, payments,
financial records or trip status. Pending requests retain their original date.
The web flow verifies email ownership independently; it does not fabricate a
mobile principal, require a password, or require completed app onboarding.

The page's in-app instructions were checked against the Customer Flutter source:
`customer_shell_page.dart` -> `/account/actions` -> `AccountActionsPage` ->
`DeleteAccountDialog`: **Account → Account actions → Delete account**.
Flutter is unchanged.

## Actual retention behavior

The grace period is read from the SAME server function used for scheduling:
`ACCOUNT_DELETION_GRACE_DAYS`, default **30 days**. Invalid/noninteger/negative
configuration fails rather than publishing an invented date. This is the earliest
anonymization eligibility time, not a guaranteed completion SLA. The worker must
run. This does not cancel travel or issue a refund.

| Category | Current behavior / period |
| --- | --- |
| Profile name/email | Replaced by deleted-account values when the due worker processes the account |
| Phone, password hash, locale, avatar URL | Cleared during that processing |
| Stored avatar object | Durable cleanup queued with anonymization; worker retries failures and retains exhausted work for Operations |
| Saved places, travel preferences, Ride reviews | Deleted during processing |
| OTP/reset records, linked OAuth accounts, website sessions | Deleted during processing |
| Mobile sessions, push-device/token rows | Revoked/invalidated, **not erased**; no fixed purge period |
| Booking/passenger/contact/travel data, journey/location records | Retained; no fixed purge period defined |
| Payments, refunds, disputes, accounting/operational audit data | Retained; no fixed purge period defined |
| Chat, notification history, Tour feedback | Retained; no fixed purge period defined |
| Internal account ID, consent/deletion history | Retained; no fixed purge period defined |
| Backups and third-party copies | No verified retention/deletion schedule available from this code/policy |

Retained booking/passenger/chat data can still contain personal information.
Profile anonymization does NOT make all records anonymous. No legal duration is
invented, no indefinite retention is represented as legally approved, and no
immediate deletion is promised. The existing account-management notes incorrectly
suggested mobile sessions/push devices were deleted; that statement is corrected.
The privacy page reuses the same EN/FR retention disclosure to avoid contradictions.

Official support comes from existing `siteConfig`: `support@beninfy.com` and
the existing WhatsApp contact. Email-inaccessible requests require support to
independently establish ownership; the page never accepts an unverified deletion
instruction or asks users to send support their password/code.

## Validation

All database tests explicitly reject non-localhost/non-test database targets.
No real Customer account is used.

- `tests/web-account-deletion.test.ts`: schema/origin/body limits, generic request
  responses before lookup, real PostgreSQL verification, expiry/replay/attempts,
  current identity binding, concurrent confirmation, atomic audit, email failure,
  abuse controls, unchanged booking/payment snapshots, mobile password/Google proof.
- `tests/web-account-deletion.browser.test.ts`: real production-build HTTP flow
  with a localhost SMTP sink restricted to `example.test`, synthetic customers,
  EN/FR routing, keyboard/focus handling, labels, live errors, 320/390/1280 px
  overflow checks and axe WCAG 2 A/AA + 2.1 AA checks on the deletion content in
  email/error/confirmed states. It also verifies website login before deletion,
  invalidation of that session, and rejection of a fresh login after deletion.
  The test adapter supplies the production Origin;
  it does not mock the API result or weaken the production guard.
- Existing Customer push, mobile contract and Tour feedback retention suites are
  used as regressions for the shared account-deletion helper.

Validation recorded 2026-10-25: the initial 218 selected backend tests passed with
zero failures/skips. After the website access guard was added, all 13 new deletion
checks passed; the selected 219-test run had 217 passes and two reported failures
(one existing push concurrent-event assertion and its parent suite). That unchanged
push suite passed all 16 tests when rerun alone after the build. This intermittent
push failure is recorded rather than hidden or fixed as unrelated scope.
The final EN/FR browser flow, including session invalidation and blocked re-login,
passed against the local production build and local SMTP sink. All three tested
form states passed the scoped axe checks.
TypeScript, focused lint and diff checks passed. The broader changed-file lint
reported only two existing Google-font warnings in the root layout. Production
build passed against disposable localhost PostgreSQL. No production migrations ran.
The page hides the floating site support widget so it cannot cover the mobile
form; accessible inline email/WhatsApp support links remain available.

For backend tests set DATABASE_URL and WEB_DELETION_TEST_DATABASE_URL to the same
disposable `127.0.0.1` database named `beninfy_dispatch_test...`, then run:

```text
node --import tsx --test tests/web-account-deletion.test.ts
```

For browser tests use a local production server (port 3108 in this session), the
same disposable DATABASE_URL, SMTP_HOST=127.0.0.1, SMTP_PORT=2527, SMTP_SECURE=false,
fixture-only SMTP_USER/SMTP_PASS/SMTP_SENDER_EMAIL and AUTH_SECRET/MOBILE_AUTH_SECRET,
and PUSH_PROVIDER=disabled. Set WEB_DELETION_TEST_BASE_URL to that localhost URL.
The test starts its own SMTP sink on 2527. Install the browser matching the pinned
playwright-core version, then run:

```text
node --import tsx --test tests/web-account-deletion.browser.test.ts
```

## References

- [Google Play account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [OWASP ownership recovery / enumeration protections](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- Local Next.js 16 route-handler and after() documentation under node_modules/next/dist/docs.
