# Mobile Error Contract

All `/api/mobile/v1` errors should use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {}
  }
}
```

Supported codes:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `INVALID_CREDENTIALS`
- `ACCOUNT_DISABLED`
- `DRIVER_NOT_LINKED`
- `DRIVER_INACTIVE`
- `VALIDATION_ERROR`
- `BOOKING_NOT_FOUND`
- `TRIP_NOT_FOUND`
- `TRIP_NOT_ASSIGNED`
- `TRIP_NOT_AVAILABLE`
- `INVALID_TRANSITION`
- `PAYMENT_REQUIRED`
- `DRIVER_NOT_ASSIGNED`
- `VEHICLE_NOT_ASSIGNED`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

The initial helper implementation lives in `src/lib/mobile/errors.ts`.

Do not return provider secrets, stack traces, SQL errors, Prisma internals, or admin-only metadata to mobile clients.
