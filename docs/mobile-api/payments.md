# Payments Contract

Payment authority remains server-side.

Mobile apps may initiate checkout and verify status through mobile APIs, but they must not:

- Hold provider secret keys
- Settle payments locally
- Mark bookings as paid
- Reserve fleet after payment without backend confirmation

Current web routes are MOBILE ADAPTABLE:

- `/api/payments/initiate`
- `/api/payments/verify`
- `/api/payments`

Webhook route is SYSTEM/WEBHOOK only:

- `/api/payments/webhook`

Implemented mobile booking payment endpoints:

| Endpoint                                                          | Status      | Notes                                                        |
| ----------------------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| `GET /api/mobile/v1/customer/bookings/:bookingId/payment`         | IMPLEMENTED | Own booking only; returns authoritative mobile-safe status.  |
| `POST /api/mobile/v1/customer/bookings/:bookingId/payment`        | IMPLEMENTED | Own booking only; returns mobile-safe provider handoff.      |
| `POST /api/mobile/v1/customer/bookings/:bookingId/payment/verify` | IMPLEMENTED | Own booking/payment only; server-side provider verification. |
| `GET /api/mobile/v1/customer/payments`                            | IMPLEMENTED | Own payments only; cursor pagination and status filtering.   |
| `GET /api/mobile/v1/customer/payments/:paymentId`                 | IMPLEMENTED | Own payment only; customer-safe detail plus follow-up state. |

Payment settlement should continue to use `src/lib/paymentSettlement.ts`.

Standalone payment history supports:

- `status=all`
- `status=paid`
- `status=pending`
- `status=failed`
- `limit`
- `cursor`

Customer responses never expose provider access codes, webhook payloads, secret keys, or internal settlement metadata.
