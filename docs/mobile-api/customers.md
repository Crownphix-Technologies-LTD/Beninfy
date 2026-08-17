# Customer Mobile API

Current status: IMPLEMENTED for core staging flows.

## Implemented Web Logic To Reuse

- Customer registration logic: `/api/auth/register`
- Customer profile: `/api/profile`
- Booking creation/read/cancel: `/api/bookings`
- Payment read/initiate/verify: `/api/payments`

## Implemented Mobile Endpoints

| Endpoint                                                   | Status      | Notes                                              |
| ---------------------------------------------------------- | ----------- | -------------------------------------------------- |
| `GET /api/mobile/v1/customer/profile`                      | IMPLEMENTED | Returns `CustomerProfileDto`.                      |
| `PATCH /api/mobile/v1/customer/profile`                    | IMPLEMENTED | Name only; phone changes require verification flow. |
| `GET /api/mobile/v1/customer/settings`                     | IMPLEMENTED | Returns customer account settings.                 |
| `PATCH /api/mobile/v1/customer/settings`                   | IMPLEMENTED | Updates locale preference.                         |
| `POST /api/mobile/v1/customer/change-password`             | IMPLEMENTED | Authenticated password change.                     |
| `GET /api/mobile/v1/customer/bookings`                     | IMPLEMENTED | Paginated `CustomerBookingSummaryDto[]`.           |
| `GET /api/mobile/v1/customer/bookings/:bookingId`          | IMPLEMENTED | Own booking only.                                  |
| `GET /api/mobile/v1/customer/bookings/:bookingId/tracking` | IMPLEMENTED | Own booking tracking snapshot.                     |
| `POST /api/mobile/v1/customer/bookings`                    | IMPLEMENTED | Reuses current booking route as a Phase 2 adapter. |
| `POST /api/mobile/v1/customer/bookings/:bookingId/cancel`  | IMPLEMENTED | Own cancellable booking only.                      |
| `GET /api/mobile/v1/customer/booking-cancellation-reasons` | IMPLEMENTED | Stable reason code catalogue.                      |

Customer identity must be derived from the mobile token. A Flutter app must not send arbitrary `userId` to access another customer booking.

Customer booking DTOs preserve booking-level status and add customer-safe leg state through `customerStatus`. Flutter should localize display text from stable codes instead of exposing raw operational wording directly.

Tracking snapshots are trip-scoped. Customers cannot query arbitrary driver locations.

Email change is deliberately deferred because changing login email requires a secure re-verification design.
