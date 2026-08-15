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
- `GET /customer/profile`
- `PATCH /customer/profile`
- `GET /customer/bookings`
- `GET /customer/bookings/:bookingId`
- `POST /customer/bookings`

## Identity Rule

Never send `userId` as ownership proof.

The backend derives customer identity from:

```text
Authorization: Bearer <accessToken>
```

Customers can only read their own bookings.

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

## Not Yet Complete

Mobile payment integration is not complete in this phase. Do not treat payment handoff as production-ready for Flutter until the mobile payment endpoints are explicitly implemented and documented.
