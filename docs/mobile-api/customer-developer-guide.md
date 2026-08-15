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
- `POST /auth/onboarding/phone`
- `POST /auth/email/send-otp`
- `POST /auth/email/verify-otp`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /customer/profile`
- `PATCH /customer/profile`
- `GET /customer/bookings`
- `GET /customer/bookings/:bookingId`
- `POST /customer/bookings`
- `GET /customer/bookings/:bookingId/payment`
- `POST /customer/bookings/:bookingId/payment`
- `POST /customer/bookings/:bookingId/payment/verify`

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

## Payments

Mobile payment handoff is implemented through backend-created Paystack or PayOnUs attempts.

Flutter must:

- request payment initiation from the backend
- present the returned hosted checkout/provider config
- fetch backend payment status after return/restart
- never mark a payment as paid locally

See `docs/mobile-api/mobile-payments.md`.
