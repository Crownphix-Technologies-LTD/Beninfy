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

Planned mobile endpoints:

| Endpoint | Status | Notes |
| --- | --- | --- |
| `POST /api/mobile/v1/payments/initiate` | PLANNED | Own booking only; returns mobile-safe provider payload. |
| `POST /api/mobile/v1/payments/verify` | PLANNED | Own payment only; no provider raw payload. |
| `GET /api/mobile/v1/payments` | PLANNED | Paginated own payments. |

Payment settlement should continue to use `src/lib/paymentSettlement.ts`.
