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
| `GET /api/mobile/v1/payments`                                     | PLANNED     | Standalone paginated payment history is not required yet.    |

Payment settlement should continue to use `src/lib/paymentSettlement.ts`.
