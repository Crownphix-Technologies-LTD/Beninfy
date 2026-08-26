# Staging Environment Variables

Do not expose mobile auth secrets with `NEXT_PUBLIC_*`.

## Required In Staging

Server-only:

- `DATABASE_URL`
- `DIRECT_URL` or `PRISMA_MIGRATE_URL`
- `AUTH_SECRET`
- `MOBILE_AUTH_SECRET`

Public/browser-safe:

- `NEXT_PUBLIC_AUTH_IDLE_TIMEOUT_SECONDS`

Required only when testing related flows:

- `PAYMENTS_ENABLED`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `PAYONUS_ENVIRONMENT`
- `PAYONUS_CLIENT_ID`
- `PAYONUS_CLIENT_SECRET`
- `PAYONUS_BUSINESS_ID`
- `PAYONUS_WEBHOOK_KEY`
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `REALTIME_AUTH_SECRET`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_ROUTES_API_KEY`
- `PUSH_PROVIDER`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `WORKER_SECRET`
- `CRON_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SENDER_EMAIL`

## Required In Production

Server-only:

- `DATABASE_URL`
- `DIRECT_URL` or `PRISMA_MIGRATE_URL`
- `AUTH_SECRET`
- `MOBILE_AUTH_SECRET`
- Payment provider secret variables for live payment flows
- SMTP credentials for live notifications
- Supabase service/secret key for admin uploads
- Google Routes API server key
- Google Places API (New) and Geocoding API server key for mobile address/current-location search
- Firebase service-account credentials for FCM
- Worker secret for scheduled reconciliation and notification retries

Public/browser-safe:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_AUTH_IDLE_TIMEOUT_SECONDS`

## Optional

- `MOBILE_ACCESS_TOKEN_TTL_SECONDS`
- `MOBILE_REFRESH_TOKEN_TTL_DAYS`
- `AUTH_SESSION_MAX_AGE_SECONDS`
- `AUTH_ADMIN_SESSION_MAX_AGE_SECONDS`
- `SMTP_LOCAL_ADDRESS`
- `PAYSTACK_WEBHOOK_ALLOWED_IPS`
- `JOURNEY_ROUTE_CACHE_TTL_SECONDS`
- `JOURNEY_ROUTE_RECALCULATE_SECONDS`
- `ENABLE_LEGACY_PAYAZA`
- `ADMIN_NOTIFICATION_EMAILS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Secret Strength

Use at least 32 random bytes for `MOBILE_AUTH_SECRET`, for example 43+ base64 characters. Keep it different from public Flutter configuration and never include it in `.env` files committed to git.

The mobile apps should only know:

- API base URL
- platform-restricted public map keys if needed
- app environment name

They must not know database URLs, Prisma config, payment secrets, SMTP credentials, Supabase service-role/secret keys, backend Google Places/Routes keys, or deployment credentials.

## Driver Test Account Provisioning

For Driver Flutter development, create a deliberate non-production driver from the staging/Preview backoffice.

Procedure:

1. Confirm the staging or Vercel Preview deployment for the backend branch under test.
2. Sign in to the backoffice with an admin role that has `drivers` permission.
3. Open Drivers and create a test driver with a real test email, phone, and the intended operational status.
4. Leave the initial password blank unless an approved temporary password is being set manually.
5. Copy the one-time temporary password from the success banner and share it out-of-band with the Flutter developer.
6. The developer should configure the Driver app with:
   - API base URL: `https://<staging-or-preview-domain>/api/mobile/v1`
   - test driver email
   - temporary password
   - any Vercel Deployment Protection bypass instructions, if that deployment requires them
7. After first successful login, the developer should verify password change through `POST /driver/change-password`.

Never commit test credentials, Vercel bypass values, or temporary passwords.

## Vercel Hobby Worker Cadence

Current staging/Hobby deployment uses once-daily Vercel Cron schedules:

- `/api/workers/notifications/deliver` at `0 2 * * *` UTC
- `/api/workers/payments/reconcile` at `0 3 * * *` UTC

Both endpoints remain protected by `WORKER_SECRET` or `CRON_SECRET` and can be manually invoked with `GET` or `POST` during staging verification. Do not create an unauthenticated bypass.

For production traffic that needs faster retries/reconciliation, either upgrade Vercel cron capability or use an approved external scheduler to call the same protected endpoints.
