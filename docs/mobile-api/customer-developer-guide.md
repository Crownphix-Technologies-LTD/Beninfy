# Customer Developer Guide

Current customer mobile API base:

```text
/api/mobile/v1
```

## Implemented Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `POST /auth/onboarding/phone`
- `POST /auth/email/send-otp`
- `POST /auth/email/verify-otp`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /customer/change-password`
- `GET /customer/settings`
- `PATCH /customer/settings`
- `GET /routes`
- `GET /routes/:routeId`
- `GET /vehicles`
- `POST /availability`
- `POST /pricing/quote`
- `POST /coupons/validate`
- `GET /customer/profile`
- `PATCH /customer/profile`
- `GET /customer/bookings`
- `GET /customer/bookings/:bookingId`
- `POST /customer/bookings`
- `GET /customer/booking-cancellation-reasons`
- `POST /customer/bookings/:bookingId/cancel`
- `GET /customer/bookings/:bookingId/payment`
- `POST /customer/bookings/:bookingId/payment`
- `POST /customer/bookings/:bookingId/payment/verify`
- `GET /customer/payments`
- `GET /customer/payments/:paymentId`
- `GET /customer/bookings/:bookingId/receipt`
- `GET /customer/bookings/:bookingId/payment-resolution`
- `GET /customer/saved-places`
- `POST /customer/saved-places`
- `PATCH /customer/saved-places/:savedPlaceId`
- `DELETE /customer/saved-places/:savedPlaceId`
- `GET /customer/travel-preferences`
- `PATCH /customer/travel-preferences`
- `POST /customer/trips/:bookingLegId/review`
- `GET /customer/reviews`
- `GET /customer/reviews/:reviewId`
- `GET /config/support`
- `POST /customer/email-change/request`
- `POST /customer/email-change/verify`
- `POST /customer/profile/avatar`
- `GET /customer/account/export`
- `POST /customer/account/delete`
- `GET /tours`
- `GET /tours/:tourId`

## Identity Rule

Never send `userId` as ownership proof.

The backend derives customer identity from:

```text
Authorization: Bearer <accessToken>
```

Customers can only read their own bookings.

## Onboarding Rule

Phone is collected after registration, but verification is done by email OTP.

Flutter should route by the backend `onboarding.status`:

- `phone_required`: show phone collection.
- `email_verification_required`: show six-digit email OTP screen.
- `complete`: show customer home.

Bookings, payments, and tracking require `complete`. `/auth/me`, OTP routes, refresh, logout, and account recovery remain available during onboarding.

## Booking Creation

The mobile booking endpoint accepts booking details, but the backend remains authoritative for:

- route validation
- pricing
- border fees
- coupons
- fleet availability
- booking legs
- payment amount

Flutter must not calculate or submit a trusted final fare.

Before booking creation, Flutter should call the discovery flow:

- `GET /routes` for supported corridors.
- `GET /vehicles` for bookable categories and passenger capacities.
- `POST /availability` for category/fleet availability on the selected trip dates.
- `POST /pricing/quote` for the authoritative display quote.
- `POST /coupons/validate` only when a customer applies a coupon.

## Payments

Mobile payment handoff is implemented through backend-created Paystack or PayOnUs attempts.

Flutter must:

- request payment initiation from the backend
- present the returned hosted checkout/provider config
- fetch backend payment status after return/restart
- never mark a payment as paid locally

See `docs/mobile-api/mobile-payments.md`.

Standalone payment history:

- `GET /customer/payments?status=all|paid|pending|failed&limit=20&cursor=<id>`
- `GET /customer/payments/:paymentId`

Receipt:

- `GET /customer/bookings/:bookingId/receipt`

Receipts use stored booking/payment records only. Flutter must not display invented VAT or unstored fare components.

## Cancel Booking

Flutter flow:

1. Customer opens an eligible booking.
2. Fetch or use cached `GET /customer/booking-cancellation-reasons`.
3. Customer chooses a reason and optional note.
4. `POST /customer/bookings/:bookingId/cancel`.
5. Update local booking state from the backend response.

Do not guess cancellation eligibility on the client.

Paid booking cancellations may return `paymentResolutions`. Flutter should show these as support/payment follow-up records, not as completed refunds.

## Account Settings

Change password:

1. Customer enters current password and new password.
2. `POST /customer/change-password`.
3. Backend returns replacement tokens.
4. Flutter replaces local access/refresh tokens.

Logout all:

1. `POST /auth/logout-all`.
2. Flutter clears local credentials.
3. Route to sign-in.

Locale:

1. User changes app language.
2. Update Flutter UI locale locally.
3. `PATCH /customer/settings` with `locale: "en"` or `locale: "fr"`.

Saved places, travel preferences, reviews, support config, account export, account deletion, avatar upload, and tour catalogue contracts are documented in their dedicated files in this directory.
