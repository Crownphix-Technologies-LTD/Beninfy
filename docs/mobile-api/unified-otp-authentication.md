# Unified Customer Email/SMS OTP Authentication

Status: implemented locally; requires migration `20261005120000_customer_unified_otp_auth` before deployment.

The backend owns OTP generation, hashing, expiry, attempts, delivery, identity resolution, Customer creation and normal mobile-session issuance. Flutter never receives an OTP from an API response and never calls Brevo directly.

## Policy

- Code: six numeric digits generated with cryptographic randomness.
- Expiry: 300 seconds.
- Maximum verification attempts: 5.
- Resend cooldown: 60 seconds.
- Current channels: `email`, `sms`.
- Future `whatsapp` support belongs in the delivery adapter; challenge/session semantics do not change.
- Email is trimmed and lowercased. Phone is submitted in international E.164 form. Explicit `+229`, `+234`, `+228`, `+233`, and other valid E.164 country codes are accepted; Nigerian `0XXXXXXXXXX` is normalized to `+234...` for compatibility.

## Start

```http
POST /api/mobile/v1/auth/otp/start
```

```json
{
  "email": "customer@example.com",
  "channel": "email",
  "phone": "+22951010405",
  "locale": "en"
}
```

`phone` is required only for `sms`. Existing Customers must submit the phone already attached to their Customer identity. The response never says whether the email exists:

```json
{
  "challenge": {
    "challengeId": "opaque-random-id",
    "channel": "email",
    "destination": "cu••••••@example.com",
    "expiresAt": "2026-10-05T12:05:00.000Z",
    "expiresIn": 300,
    "resendAvailableAt": "2026-10-05T12:01:00.000Z",
    "resendAfter": 60
  }
}
```

Success is `202`. A matching Driver/Admin/privileged identity and an existing Customer with a mismatched SMS number receive the same public challenge shape, but no code capable of authenticating that identity is delivered. This avoids membership and role disclosure. Changing channel uses `start` again and invalidates the prior active challenge.

Errors: `400 VALIDATION_ERROR`, `400 PHONE_INVALID`, `429 OTP_RATE_LIMITED`, `503 OTP_DELIVERY_UNAVAILABLE`.

## Resend

```http
POST /api/mobile/v1/auth/otp/resend
```

```json
{ "challengeId": "opaque-random-id" }
```

Resend keeps the same channel/destination, invalidates the prior challenge and returns a new challenge envelope and ID. It never extends one challenge indefinitely. Use `start` to switch channel.

Errors: `400 OTP_INVALID`, `429 OTP_RESEND_TOO_SOON` with `details.retryAfter`, `429 OTP_RATE_LIMITED`, `503 OTP_DELIVERY_UNAVAILABLE`.

## Verify

```http
POST /api/mobile/v1/auth/otp/verify
```

```json
{
  "challengeId": "opaque-random-id",
  "code": "123456",
  "device": {
    "deviceId": "installation-id",
    "platform": "ios",
    "deviceName": "iPhone",
    "appVersion": "1.0.0"
  }
}
```

Existing Customer success returns the same standard session family used by password and Google authentication:

```json
{
  "ok": true,
  "outcome": "authenticated",
  "principalType": "CUSTOMER",
  "user": {},
  "onboarding": {},
  "accessToken": "...",
  "refreshToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

Unknown Customer success proves the selected destination and returns no session yet:

```json
{
  "ok": true,
  "outcome": "signup_required",
  "challengeId": "opaque-random-id",
  "channel": "email",
  "signup": { "required": true }
}
```

Errors: `400 OTP_INVALID`, `410 OTP_EXPIRED`, `429 OTP_ATTEMPTS_EXCEEDED`, `429 OTP_RATE_LIMITED`.

## Complete passwordless signup

```http
POST /api/mobile/v1/auth/otp/signup
```

```json
{
  "challengeId": "verified-opaque-random-id",
  "name": "Customer Name",
  "phone": "+22951010405",
  "termsAccepted": true,
  "privacyAccepted": true,
  "locale": "en",
  "device": {
    "deviceId": "installation-id",
    "platform": "ios",
    "deviceName": "iPhone",
    "appVersion": "1.0.0"
  }
}
```

The verified challenge is locked and consumed atomically with Customer creation. SMS signup requires the submitted phone to match the verified SMS destination. Success is `201` with `outcome=authenticated` and the standard Customer session response. Password is optional and remains unset. Concurrent duplicate creation is rejected with `409 OTP_IDENTITY_CONFLICT`; Flutter must restart verification.

Email verification sets `emailVerified`. SMS verification sets `phoneVerified` and does not set `emailVerified`. Traveller/contact count or profile data never changes OTP authority.

## Security and compatibility

- Active challenge creation is serialized by normalized identity; newer starts invalidate older challenges.
- Verification and signup use serializable transactions and row locks.
- OTP codes are HMAC-hashed and never persisted or logged as plaintext.
- Rate limits apply to IP, normalized destination/identity, challenge and signup attempts.
- Provider delivery failure invalidates the challenge and cannot create/authenticate a Customer.
- Driver/Admin identities never become Customers through OTP.
- Password and Google `Account` rows are not changed by OTP authentication.
- Refresh, logout, logout-all, push ownership and account isolation use existing `MobileSession` behavior.
- Existing password registration/login, Google login/linking, and legacy onboarding OTP routes remain available.

Google linking still uses the deployed current-password proof contract. The new OTP challenge model is purpose/channel capable, but an OTP-to-Google-link exchange endpoint is intentionally deferred so the production linking contract is not destabilized in this pass.

There is no safe set-password endpoint for passwordless Customers yet: the existing change-password endpoint requires a current password. Add a separately verified set-password contract before exposing that UI.

## Server configuration

- Email: existing `SMTP_*` variables.
- SMS: `BREVO_API_KEY`, `BREVO_SMS_SENDER`.
- Challenge hashing: `MOBILE_OTP_SECRET`, falling back to `MOBILE_AUTH_SECRET` or `AUTH_SECRET`.

All are backend-only. No `NEXT_PUBLIC_*` credential is supported.
