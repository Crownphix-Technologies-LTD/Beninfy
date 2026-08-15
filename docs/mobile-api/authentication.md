# Mobile Authentication

The existing web app should continue using Auth.js.

Flutter should not rely on browser cookies as its primary authentication contract. Introduce token-based mobile auth under `/api/mobile/v1/auth/...`.

## Recommended Model

Use short-lived access tokens plus refresh tokens.

Access token:

- Sent as `Authorization: Bearer <token>`
- Short expiry, for example 10-15 minutes
- Contains only minimal claims: subject, role, token version, session/device id

Refresh token:

- Stored securely by Flutter using platform secure storage
- Rotated on use
- Revocable server-side
- Bound to a device/session record

## Endpoints

| Endpoint                                    | Status      | Principal                                   |
| ------------------------------------------- | ----------- | ------------------------------------------- |
| `POST /api/mobile/v1/auth/register`         | IMPLEMENTED | PUBLIC customer registration                |
| `POST /api/mobile/v1/auth/login`            | IMPLEMENTED | PUBLIC customer or driver login             |
| `POST /api/mobile/v1/auth/refresh`          | IMPLEMENTED | PUBLIC with valid refresh token             |
| `POST /api/mobile/v1/auth/logout`           | IMPLEMENTED | Refresh token revocation                    |
| `GET /api/mobile/v1/auth/me`                | IMPLEMENTED | CUSTOMER or DRIVER                          |
| `POST /api/mobile/v1/auth/onboarding/phone` | IMPLEMENTED | CUSTOMER collects phone and sends email OTP |
| `POST /api/mobile/v1/auth/email/send-otp`   | IMPLEMENTED | CUSTOMER resend email OTP                   |
| `POST /api/mobile/v1/auth/email/verify-otp` | IMPLEMENTED | CUSTOMER verify email OTP                   |
| `POST /api/mobile/v1/auth/forgot-password`  | IMPLEMENTED | PUBLIC generic reset request                |
| `POST /api/mobile/v1/auth/reset-password`   | IMPLEMENTED | PUBLIC single-use token reset               |
| `GET /api/mobile/v1/auth/sessions`          | PLANNED     | CUSTOMER or DRIVER                          |
| `DELETE /api/mobile/v1/auth/sessions/:id`   | PLANNED     | CUSTOMER or DRIVER                          |

Google sign-in can be added later by verifying Google ID tokens server-side. Google client secrets must remain server-side.

## Login Example

```json
{
  "email": "customer@example.com",
  "password": "password",
  "principalType": "CUSTOMER",
  "device": {
    "deviceId": "ios-device-id",
    "platform": "ios",
    "deviceName": "iPhone",
    "appVersion": "1.0.0"
  }
}
```

`principalType` can be `CUSTOMER` or `DRIVER`. Driver login succeeds only when the authenticated `User` is linked to an active operational `Driver`.

Refresh tokens are stored only as hashes in `MobileSession`.

## Customer Onboarding

Customer registration collects name, email, password, locale, and explicit Terms/Privacy acceptance. Phone is collected after authentication through `/auth/onboarding/phone`.

The backend sends a six-digit OTP to the customer email address, not by SMS. Phone is stored as customer contact data and is not used as a login identifier.

Stable onboarding states:

- `phone_required`
- `email_verification_required`
- `complete`

`register`, `login`, and `/me` include an `onboarding` object so Flutter can route splash/sign-in/onboarding/home without guessing.

Transactional customer endpoints such as bookings, payment, and tracking return `ONBOARDING_INCOMPLETE` until onboarding is complete.

## Account Recovery

Forgot password always returns a generic success response to prevent account enumeration.

Reset links use a single-use hashed token. A successful reset updates the password, increments the mobile session version, and revokes active mobile sessions. The email contains both a web URL and the app deep-link format:

```text
beninfy://reset-password?token=<token>
```

## Revocation

Mobile auth should support:

- User `sessionVersion`
- Refresh token revocation
- Device/session revocation
- Role/account disabled checks on every refresh
- Immediate logout after password reset or admin disablement
