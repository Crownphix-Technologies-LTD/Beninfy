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
- `ADMIN_NOTIFICATION_EMAILS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Secret Strength

Use at least 32 random bytes for `MOBILE_AUTH_SECRET`, for example 43+ base64 characters. Keep it different from public Flutter configuration and never include it in `.env` files committed to git.

The mobile apps should only know:

- API base URL
- public map keys if needed
- app environment name

They must not know database URLs, Prisma config, payment secrets, SMTP credentials, Supabase service-role/secret keys, or deployment credentials.
