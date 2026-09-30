# Mobile RC Deployment Plan

The canonical production mobile API is `https://www.beninfy.com/api/mobile/v1`.
Production must remain unchanged until a reviewed release is approved.

The approved RC architecture is a dedicated Vercel project at
`https://staging.beninfy.com`, backed by an isolated staging PostgreSQL/Supabase
project. RC builds must use `https://staging.beninfy.com/api/mobile/v1` only after
DNS, TLS, public API access, configuration, migrations, and smoke tests pass.
Never point staging at the production database or require a Vercel bypass secret
inside a distributed mobile build.

## Required Configuration

- Runtime database: `DATABASE_URL`
- Migrations: `DIRECT_URL` or `PRISMA_MIGRATE_URL`
- Authentication: `AUTH_SECRET`, `MOBILE_AUTH_SECRET`
- Push: `PUSH_PROVIDER=fcm`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
  `FIREBASE_PRIVATE_KEY`
- Workers: `WORKER_SECRET` or `CRON_SECRET`
- Google server APIs: `GOOGLE_PLACES_API_KEY`, `GOOGLE_ROUTES_API_KEY`
- Staging SMTP, storage, and sandbox/test payment credentials

All credentials remain server-only. Do not copy production financial credentials
blindly or expose service credentials through `NEXT_PUBLIC_*` variables.

## Release Procedure

1. Provision the isolated staging database and Vercel project.
2. Attach `staging.beninfy.com`; verify DNS/TLS and disable sign-in protection for
   the mobile API.
3. Configure staging-only secrets.
4. Apply the migration history with `prisma migrate deploy`, including
   `20260923120000_customer_push_session_ownership` and
   `20260924090000_admin_notification_management`.
5. Deploy the reviewed feature-branch commit to staging only.
6. Require `/api/health` HTTP 200 with `readiness.push.configured = true`.
7. Smoke-test Customer authentication, registration/revocation, A-to-B ownership,
   inbox, Ride/Tour reads, and sandbox payment initialization.
8. Dispatch one controlled notification through the authenticated worker. Provider
   acceptance is not proof of physical delivery.
9. Approve the RC URL for TestFlight/Play only after every check passes.

## Rollback

Roll staging traffic back to the prior known-good deployment. Preserve Notification,
NotificationDelivery, PushDevice, campaign, and audit history. Prefer forward schema
repairs; do not reset the database or delete registrations as a rollback mechanism.
Re-run health, authentication, Ride/Tour reads, inbox, and payment-initialization
smoke tests after rollback.
