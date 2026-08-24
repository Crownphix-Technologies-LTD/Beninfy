# Beninfy Mobile API

Status: Mobile backend foundation plus production-completion integration contracts.

The future Flutter apps `beninfy-customer` and `beninfy-driver` will consume the Beninfy platform backend through stable mobile APIs. They must not connect directly to PostgreSQL, depend on Prisma models, call admin UI internals, calculate authoritative prices, settle payments locally, or invent trip lifecycle rules.

## Recommended Namespace

Use versioned mobile endpoints:

```text
/api/mobile/v1/...
```

Existing web and admin endpoints should remain where they are. Mobile endpoints should be explicit contracts with stable DTOs, stable error responses, token-based auth, pagination where needed, rate limiting, and idempotency for write operations.

## Current API Readiness Summary

| Area                                     | Current routes                                                                                                    | Readiness      | Notes                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| Auth.js browser auth                     | `/api/auth/*`                                                                                                     | WEB ONLY       | Browser/session-oriented. Do not expose as the primary Flutter auth contract.                                  |
| Customer registration                    | `/api/mobile/v1/auth/register`                                                                                    | IMPLEMENTED    | Token auth, onboarding state, and email OTP verification.                                                      |
| Customer profile                         | `/api/mobile/v1/customer/profile`, `/api/mobile/v1/auth/me`                                                       | IMPLEMENTED    | Token-authenticated customer profile DTOs.                                                                     |
| Bookings                                 | `/api/mobile/v1/customer/bookings*`                                                                               | IMPLEMENTED    | Customer-owned list/detail/create/cancel/payment/tracking contracts.                                           |
| Payment initiation/verify                | `/api/mobile/v1/customer/bookings/:bookingId/payment*`                                                            | IMPLEMENTED    | Backend-owned Paystack/PayOnUs handoff and verification.                                                       |
| Payment webhook                          | `/api/payments/webhook`                                                                                           | SYSTEM/WEBHOOK | Never called by mobile clients.                                                                                |
| Catalog vehicles/tours/routes/prices     | `/api/mobile/v1/routes`, `/api/mobile/v1/vehicles`, `/api/mobile/v1/availability`, `/api/mobile/v1/pricing/quote` | IMPLEMENTED    | Mobile-safe discovery, live availability, and backend-authoritative quote DTOs.                                |
| Places search                            | `/api/mobile/v1/places/autocomplete`, `/api/mobile/v1/places/reverse`, `/api/mobile/v1/places/:placeId`           | IMPLEMENTED    | Backend-owned Google Places/Geocoding APIs; Flutter receives safe location DTOs only.                          |
| Coupons                                  | `/api/mobile/v1/coupons/validate`                                                                                 | IMPLEMENTED    | Mobile error contract; requires completed customer onboarding.                                                 |
| Admin operations                         | `/api/admin/*`                                                                                                    | ADMIN ONLY     | Do not expose to Flutter apps.                                                                                 |
| Media proxy                              | `/api/media/*`                                                                                                    | MOBILE READY   | Safe to consume as public media if cache behavior remains stable.                                              |
| Mobile auth                              | `/api/mobile/v1/auth/*`                                                                                           | IMPLEMENTED    | Customer/driver token auth, refresh rotation, logout, and `me`.                                                |
| Mobile customer product APIs             | `/api/mobile/v1/customer/*`                                                                                       | IMPLEMENTED    | Profile, bookings, saved places, preferences, payments, receipts, reviews, account.                            |
| Mobile driver profile/home/trips/actions | `/api/mobile/v1/driver/*`                                                                                         | IMPLEMENTED    | Linked-driver profile, Home projection, assigned trips, assignment history, lifecycle actions, and password change. |
| Live GPS, push, chat                     | `/api/mobile/v1/driver/tracking*`, `/api/mobile/v1/trips/*/chat*`, notification endpoints                         | IMPLEMENTED    | Supabase Broadcast metadata/publishing, FCM provider, and retry worker are backend-ready pending provider env. |

See the topic files in this directory for planned contracts.

Additional references:

- `api-readiness.md`
- `production-completion.md`
- `routes.md`
- `places.md`
- `pricing.md`
- `coupons.md`
- `cancellations.md`
- `saved-places.md`
- `travel-preferences.md`
- `reviews.md`
- `payments.md`
- `receipts.md`
- `payment-resolutions.md`
- `support.md`
- `account-management.md`
- `tours.md`
- `settings.md`
- `cors.md`
- `phase-2-migration.md`
- `staging-environment.md`
- `staging-smoke-test.md`
- `flutter-development.md`
- `driver-developer-guide.md`
- `customer-developer-guide.md`
- `onboarding.md`
- `onboarding-staging-test.md`
