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
- Anonymization replaces profile name/email with a deleted-account identity; clears phone, password, locale and avatar URL; deletes saved places, preferences, OTP/password reset material, OAuth accounts, web sessions and Ride reviews. Stored avatar cleanup is atomically queued and retried by the same authenticated worker after anonymization commits; unresolved attempts remain blocked for Operations.
- Mobile sessions and push devices are **revoked/invalidated, not deleted**. Their stored rows (including push tokens) remain. Chat, notification history, Tour feedback and account/consent/deletion metadata also remain.
- Bookings, trip records, payment/accounting records, refund/dispute history, and operational audit trails are retained.
- No fixed retention periods or automatic purge deadlines for the retained categories are defined by the current policy/worker. Do not claim these records are anonymous or deleted after the grace period. Backup/provider retention must be separately reviewed before publication.
- Backoffice can see Google-linked state, deletion timestamps, disabled state, and anonymized state. Super admins may cancel a pending deletion before anonymization; old mobile sessions are not restored.
- Request, restoration and anonymization serialize on the User row. Web/mobile requests, restoration and worker completion write atomic minimal audit events. See [worker operations](./account-deletion-worker-operations.md) for retry bounds, scheduling evidence and monitoring.

Public web requests use `/delete-account` (localized EN/FR), without app installation or login.
`POST /api/account-deletion/request` sends a purpose-bound, ten-minute email code;
`POST /api/account-deletion/confirm` requires that code and `DELETE_MY_ACCOUNT`.
It reuses the same account-disabling transaction and existing anonymization worker.
See [web-account-deletion.md](./web-account-deletion.md) for security and release checks.

Data export:

- Returns synchronous JSON.
- Excludes passwords, tokens, OTP secrets, session records, and provider access codes.
