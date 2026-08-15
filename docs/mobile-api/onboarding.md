# Customer Mobile Onboarding

Phone is collected for operations contact. Verification is performed by email OTP.

## Flow

1. `POST /api/mobile/v1/auth/register`
2. Read `onboarding.status`
3. If `phone_required`, call `POST /api/mobile/v1/auth/onboarding/phone`
4. Show the email OTP screen
5. Call `POST /api/mobile/v1/auth/email/verify-otp`
6. Route to customer home when `status` is `complete`

## Register

```json
{
  "firstName": "Ada",
  "lastName": "Mensah",
  "email": "ada@example.com",
  "password": "strong-password",
  "termsAccepted": true,
  "privacyAccepted": true,
  "locale": "en"
}
```

The response includes tokens, `user`, and `onboarding`.

## Collect Phone And Send Email OTP

```http
POST /api/mobile/v1/auth/onboarding/phone
Authorization: Bearer <accessToken>
```

```json
{
  "phone": "+229 51 01 91 34",
  "locale": "en"
}
```

The backend normalizes supported Benin and Nigeria phone formats, stores the phone number, and sends the OTP to the authenticated account email.

## Resend Email OTP

```http
POST /api/mobile/v1/auth/email/send-otp
Authorization: Bearer <accessToken>
```

```json
{
  "locale": "fr"
}
```

Resend is rate-limited and cooldown-protected.

## Verify Email OTP

```http
POST /api/mobile/v1/auth/email/verify-otp
Authorization: Bearer <accessToken>
```

```json
{
  "verificationId": "challenge_id",
  "code": "123456"
}
```

OTP codes are single-use, hashed server-side, expire, and have attempt limits.

## Stable Errors

- `PHONE_INVALID`
- `OTP_INVALID`
- `OTP_EXPIRED`
- `OTP_ATTEMPTS_EXCEEDED`
- `OTP_RESEND_TOO_SOON`
- `OTP_RATE_LIMITED`
- `ONBOARDING_INCOMPLETE`

## Password Recovery

`POST /api/mobile/v1/auth/forgot-password` always returns a generic success response.

`POST /api/mobile/v1/auth/reset-password` accepts:

```json
{
  "token": "email-token",
  "password": "new-strong-password"
}
```

Successful reset consumes the token and revokes active mobile sessions.
