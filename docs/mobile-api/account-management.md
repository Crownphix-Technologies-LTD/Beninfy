# Account Management

Implemented endpoints:

- `POST /api/mobile/v1/customer/email-change/request`
- `POST /api/mobile/v1/customer/email-change/verify`
- `POST /api/mobile/v1/customer/profile/avatar`
- `DELETE /api/mobile/v1/customer/profile/avatar`
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
- Upload response returns `{ user, avatarUrl }`, where `user` is the updated Customer profile DTO.
- Replacement and delete attempt best-effort cleanup of the old Supabase Storage object when the URL belongs to the configured bucket.
- `DELETE /api/mobile/v1/customer/profile/avatar` clears the avatar and returns `{ user, avatarUrl: null }`.

Account deletion:

- Requires exact confirmation: `DELETE_MY_ACCOUNT`.
- Password accounts must also submit `currentPassword`.
- Google-only accounts do not have a password to verify, so the backend requires a recent authenticated mobile session.
- The request immediately disables account access, increments `sessionVersion`, revokes mobile sessions, and revokes push devices.
- The account moves to `deletion.status = "pending"` with `requestedAt`, `scheduledAt`, and `anonymizedAt`.
- A secured worker endpoint, `POST /api/workers/accounts/anonymize`, processes due accounts after `ACCOUNT_DELETION_GRACE_DAYS`.
- Anonymization removes or clears profile identity, email, phone, avatar, saved places, preferences, OTP/password reset material, OAuth accounts, web sessions, mobile sessions, push devices, and reviews.
- Bookings, trip records, payment/accounting records, refund/dispute history, and operational audit trails are retained.
- Backoffice can see Google-linked state, deletion timestamps, disabled state, and anonymized state. Super admins may cancel a pending deletion before anonymization; old mobile sessions are not restored.

Data export:

- Returns synchronous JSON.
- Excludes passwords, tokens, OTP secrets, session records, and provider access codes.
