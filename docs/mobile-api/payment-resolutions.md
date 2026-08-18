# Payment Resolutions

Payment resolutions are internal follow-up records for paid bookings that need manual review, such as customer-cancelled paid bookings.

Customer endpoint:

- `GET /api/mobile/v1/customer/bookings/:bookingId/payment-resolution`

Requires a customer bearer token and completed onboarding. It returns the authoritative `PaymentResolution` state from Prisma.

Admin operations:

- `GET /api/admin/payment-resolutions`
- `GET /api/admin/payment-resolutions/:id`
- `POST /api/admin/payment-resolutions/:id/actions`

Admin actions are guarded by the payments permission and use an action-based state machine.

Transition matrix:

| Action | From | To |
| --- | --- | --- |
| `start_review` | `review_required` | `under_review` |
| `approve` | `under_review` | `approved` |
| `mark_processing` | `approved` | `processing` |
| `complete` | `processing` | `completed` |
| `reject` | `under_review` | `rejected` |

This phase does not execute provider refunds. Paystack/PayOnUs provider refund execution remains a future operations integration.
