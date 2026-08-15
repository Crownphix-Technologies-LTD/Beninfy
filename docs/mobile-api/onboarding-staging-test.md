# Mobile Onboarding Staging Test

Apply migrations before testing:

1. `20260813120000_mobile_auth_foundation`
2. `20260815120000_scalability_concurrency_indexes`
3. `20260815240000_mobile_onboarding_otp`

## Environment

Required:

- `MOBILE_AUTH_SECRET` or `AUTH_SECRET`
- `MOBILE_ONBOARDING_SECRET` recommended
- SMTP/Brevo email variables used by the existing Beninfy email system

Optional:

- `MOBILE_EMAIL_OTP_TTL_MS`
- `MOBILE_EMAIL_OTP_RESEND_COOLDOWN_MS`
- `MOBILE_EMAIL_OTP_MAX_ATTEMPTS`
- `MOBILE_PASSWORD_RESET_TTL_MS`
- `TERMS_VERSION`
- `PRIVACY_VERSION`

No SMS provider is required for this phase.

## Happy Path

1. Register a customer without phone.
2. Confirm response `onboarding.status` is `phone_required`.
3. Call `/auth/onboarding/phone` with a Benin or Nigeria phone number.
4. Confirm response includes `verificationId`, `expiresAt`, `resendAvailableAt`, and `email_verification_required`.
5. Confirm the customer receives the branded email OTP.
6. Submit the OTP to `/auth/email/verify-otp`.
7. Confirm response `onboarding.status` is `complete`.
8. Confirm `/auth/me` returns `complete`.
9. Confirm customer booking endpoints are accessible only after completion.

## Negative Cases

- Invalid phone returns `PHONE_INVALID`.
- Wrong OTP returns `OTP_INVALID`.
- Expired OTP returns `OTP_EXPIRED`.
- Too many attempts returns `OTP_ATTEMPTS_EXCEEDED`.
- Resend before cooldown returns `OTP_RESEND_TOO_SOON`.
- Booking/payment/tracking before completion returns `ONBOARDING_INCOMPLETE`.
- Forgot password returns the same generic response for existing and unknown emails.
- Reset token can be used only once.

## Not Implemented In This Phase

- Phone/SMS OTP
- Phone login
- Flutter UI screens
- Production SMS delivery
