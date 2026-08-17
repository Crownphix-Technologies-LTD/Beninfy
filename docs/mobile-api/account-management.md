# Account Management

Implemented endpoints:

- `POST /api/mobile/v1/customer/email-change/request`
- `POST /api/mobile/v1/customer/email-change/verify`
- `POST /api/mobile/v1/customer/profile/avatar`
- `GET /api/mobile/v1/customer/account/export`
- `POST /api/mobile/v1/customer/account/delete`

All endpoints require a customer bearer token and completed onboarding.

Email change:

- Requires the current password.
- Sends a six-digit OTP to the new email.
- Verifying the OTP changes the login email, marks it verified, revokes existing mobile sessions, and returns replacement tokens.
- Flutter must never send user IDs, OTP secrets, or authoritative verification state.

Avatar:

- Uses multipart form data with field `file`.
- Accepted types are JPEG, PNG, WebP, and AVIF.
- Max size is 2 MB.
- Uploads use server-side Supabase Storage credentials only.

Account deletion:

- Requires current password.
- Requires exact confirmation: `DELETE_MY_ACCOUNT`.
- Soft-disables the account and revokes mobile sessions.
- Booking and payment records are retained for operational, accounting, and legal reasons.

Data export:

- Returns synchronous JSON.
- Excludes passwords, tokens, OTP secrets, session records, and provider access codes.
