# Staging Smoke Test Plan

Base URL:

```text
https://STAGING_DOMAIN/api/mobile/v1
```

Use staging-only users, bookings, drivers, vehicles, and payment data.

## Customer Flow

1. Register test customer  
   `POST /auth/register`  
   Expected: `201`, response contains `user`, `accessToken`, `refreshToken`.

2. Login  
   `POST /auth/login` with `principalType: "CUSTOMER"`  
   Expected: `200`, response contains customer principal and tokens.

3. Read authenticated principal  
   `GET /auth/me` with `Authorization: Bearer <accessToken>`  
   Expected: `200`, `principal.type = "CUSTOMER"`.

4. Get profile  
   `GET /customer/profile`  
   Expected: `200`, `CustomerProfileDto`.

5. List bookings  
   `GET /customer/bookings?limit=20`  
   Expected: `200`, `bookings[]`, `pageInfo`.

6. Get own booking  
   `GET /customer/bookings/:bookingId`  
   Expected: `200`, `CustomerBookingDetailDto`.

7. Attempt another customer's booking  
   `GET /customer/bookings/:otherCustomerBookingId`  
   Expected: `404`, `error.code = "BOOKING_NOT_FOUND"`.

8. Refresh token  
   `POST /auth/refresh` with current refresh token  
   Expected: `200`, new `accessToken` and rotated `refreshToken`.

9. Logout  
   `POST /auth/logout` with latest refresh token  
   Expected: `200`, `{ "ok": true }`.

10. Reuse revoked refresh token  
    `POST /auth/refresh` with logged-out refresh token  
    Expected: `401`, `error.code = "UNAUTHENTICATED"`.

## Driver Flow

1. Login as linked driver user  
   `POST /auth/login` with `principalType: "DRIVER"`  
   Expected: `200`, response contains `principalType = "DRIVER"` and `driver`.

2. Read authenticated principal  
   `GET /auth/me`  
   Expected: `200`, `principal.type = "DRIVER"`.

3. Get driver profile  
   `GET /driver/profile`  
   Expected: `200`, `DriverProfileDto`.

4. List assigned trips  
   `GET /driver/trips?limit=20`  
   Expected: `200`, assigned trips only.

5. Get assigned trip detail  
   `GET /driver/trips/:bookingLegId`  
   Expected: `200`, `DriverTripDetailDto`.

6. Attempt another driver's trip  
   `GET /driver/trips/:otherDriverBookingLegId`  
   Expected: `404`, `error.code = "TRIP_NOT_FOUND"`.

7. Perform allowed trip action  
   `POST /driver/trips/:bookingLegId/actions` with `{ "action": "dispatch" }` when current status is `assigned` and a fleet vehicle is assigned.  
   Expected: `200`, response status becomes `dispatched`.

8. Attempt invalid transition  
   Repeat `dispatch` on an already `dispatched` trip.  
   Expected: `409`, `error.code = "INVALID_TRANSITION"`.

9. Confirm inactive driver is rejected  
   Set linked `Driver.status` to `inactive` in staging/admin, then call `GET /driver/profile`.  
   Expected: `403`, `error.code = "DRIVER_INACTIVE"`.

## Common Failure Checks

- Missing bearer token: `401`, `UNAUTHENTICATED`.
- Customer token on driver endpoint: `403`, `FORBIDDEN`.
- Driver token on customer endpoint: `403`, `FORBIDDEN`.
- Disabled user account: `403`, `ACCOUNT_DISABLED`.
- Unlinked driver user: `403`, `DRIVER_NOT_LINKED`.
- Malformed request body: `400`, `VALIDATION_ERROR`.
