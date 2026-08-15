# Customer Mobile API

Current status: MOBILE ADAPTABLE, not fully implemented as a stable mobile API.

## Implemented Web Logic To Reuse

- Customer registration logic: `/api/auth/register`
- Customer profile: `/api/profile`
- Booking creation/read/cancel: `/api/bookings`
- Payment read/initiate/verify: `/api/payments`

## Planned Mobile Endpoints

| Endpoint                                          | Status      | Notes                                              |
| ------------------------------------------------- | ----------- | -------------------------------------------------- |
| `GET /api/mobile/v1/customer/profile`             | IMPLEMENTED | Returns `CustomerProfileDto`.                      |
| `PATCH /api/mobile/v1/customer/profile`           | IMPLEMENTED | Name/phone only.                                   |
| `GET /api/mobile/v1/customer/bookings`            | IMPLEMENTED | Paginated `CustomerBookingSummaryDto[]`.           |
| `GET /api/mobile/v1/customer/bookings/:bookingId` | IMPLEMENTED | Own booking only.                                  |
| `POST /api/mobile/v1/customer/bookings`           | IMPLEMENTED | Reuses current booking route as a Phase 2 adapter. |
| `DELETE /api/mobile/v1/customer/bookings/:id`     | PLANNED     | Own cancellable booking only.                      |

Customer identity must be derived from the mobile token. A Flutter app must not send arbitrary `userId` to access another customer booking.

Customer booking DTOs preserve booking-level status and add customer-safe leg state through `customerStatus`. Flutter should localize display text from stable codes instead of exposing raw operational wording directly.
