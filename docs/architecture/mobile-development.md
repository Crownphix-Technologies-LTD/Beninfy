# Mobile Development Ownership

The existing Beninfy repository remains the Beninfy platform repository.

## Beninfy Platform Repository

Primary owner: lead developer.

Contains:

- Next.js web app
- Admin backoffice
- API/backend
- Prisma and database schema
- PostgreSQL access
- Payments
- Pricing
- Fleet operations
- Booking operations
- Authentication infrastructure
- Storage integrations

## Customer Flutter Repository

Future repository: `beninfy-customer`.

Primary owner: lead developer.

Consumes `/api/mobile/v1` contracts only.

## Driver Flutter Repository

Future repository: `beninfy-driver`.

Primary owner: second developer.

Consumes `/api/mobile/v1` driver contracts only.

## Collaboration Rules

Flutter apps must not invent backend contracts independently.

Lead developer approval is required for:

- Database schema
- Authentication
- Payments
- Pricing
- Booking lifecycle
- Authorization
- Production deployment
- API contract changes

## Access Recommendation

The driver developer should start with:

- Write access to the driver Flutter repository.
- Read access to the platform repository.
- No production secrets.
- No production database access.
- No payment secrets.
- No production deployment access.

Backend write access should be granted only later and only through pull requests reviewed by the lead developer.

The lead developer should retain admin/write access to the platform repository and both Flutter repositories.

Backend/API contract changes should be requested through the lead developer until the mobile teams have a mature review process.

## Environment Strategy

Local:

```text
Flutter app -> local Beninfy backend
```

Staging:

```text
Flutter app -> staging Beninfy API
```

Production:

```text
Released app -> production Beninfy API
```

Flutter builds must use environment-specific API base URLs. Do not hardcode production URLs into development builds.

Mobile developers should not need production database credentials, Prisma access, payment secret keys, SMTP credentials, Supabase service-role keys, deployment credentials, Apple publishing credentials, or Google Play publishing credentials.
