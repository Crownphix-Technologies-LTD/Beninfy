# Beninfy Mobile API

Status: Phase 1 readiness documentation.

The future Flutter apps `beninfy-customer` and `beninfy-driver` will consume the Beninfy platform backend through stable mobile APIs. They must not connect directly to PostgreSQL, depend on Prisma models, call admin UI internals, calculate authoritative prices, settle payments locally, or invent trip lifecycle rules.

## Recommended Namespace

Use versioned mobile endpoints:

```text
/api/mobile/v1/...
```

Existing web and admin endpoints should remain where they are. Mobile endpoints should be explicit contracts with stable DTOs, stable error responses, token-based auth, pagination where needed, rate limiting, and idempotency for write operations.

## Current API Readiness Summary

| Area                                 | Current routes                                                            | Readiness        | Notes                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| Auth.js browser auth                 | `/api/auth/*`                                                             | WEB ONLY         | Browser/session-oriented. Do not expose as the primary Flutter auth contract.       |
| Customer registration                | `/api/auth/register`                                                      | MOBILE ADAPTABLE | Useful logic, but response/error contract and mobile token issuance are missing.    |
| Customer profile                     | `/api/profile`                                                            | MOBILE ADAPTABLE | Session-cookie auth and web-shaped responses.                                       |
| Bookings                             | `/api/bookings`, `/api/bookings/[id]`                                     | MOBILE ADAPTABLE | Strong domain logic, but web/session assumptions and non-versioned DTOs.            |
| Payment initiation/verify            | `/api/payments/*`                                                         | MOBILE ADAPTABLE | Backend settlement is correct; mobile needs explicit provider DTOs and idempotency. |
| Payment webhook                      | `/api/payments/webhook`                                                   | SYSTEM/WEBHOOK   | Never called by mobile clients.                                                     |
| Catalog vehicles/tours/routes/prices | `/api/mobile/v1/routes`, `/api/mobile/v1/vehicles`, `/api/mobile/v1/availability`, `/api/mobile/v1/pricing/quote` | IMPLEMENTED | Mobile-safe discovery, live availability, and backend-authoritative quote DTOs. |
| Coupons                              | `/api/mobile/v1/coupons/validate`                                         | IMPLEMENTED      | Mobile error contract; requires completed customer onboarding.                      |
| Admin operations                     | `/api/admin/*`                                                            | ADMIN ONLY       | Do not expose to Flutter apps.                                                      |
| Media proxy                          | `/api/media/*`                                                            | MOBILE READY     | Safe to consume as public media if cache behavior remains stable.                   |
| Mobile auth                          | `/api/mobile/v1/auth/*`                                                   | IMPLEMENTED      | Customer/driver token auth, refresh rotation, logout, and `me`.                     |
| Mobile customer profile/bookings     | `/api/mobile/v1/customer/*`                                               | IMPLEMENTED      | Profile, booking list/detail, and booking creation adapter.                         |
| Mobile driver profile/trips/actions  | `/api/mobile/v1/driver/*`                                                 | IMPLEMENTED      | Linked-driver profile, assigned trips, and minimal status actions.                  |
| Live GPS, push, chat                 | none                                                                      | MOBILE MISSING   | Explicitly out of Phase 2.                                                          |

See the topic files in this directory for planned contracts.

Additional references:

- `api-readiness.md`
- `routes.md`
- `pricing.md`
- `cors.md`
- `phase-2-migration.md`
- `staging-environment.md`
- `staging-smoke-test.md`
- `flutter-development.md`
- `driver-developer-guide.md`
- `customer-developer-guide.md`
- `onboarding.md`
- `onboarding-staging-test.md`
