# Payment Resolutions

Payment resolutions are internal follow-up records for paid bookings that need manual review, such as customer-cancelled paid bookings.

Implemented endpoint:

- `GET /api/mobile/v1/customer/bookings/:bookingId/payment-resolution`

Requires a customer bearer token and completed onboarding.

Current statuses:

- `review_required`
- `requested`
- `under_review`
- `approved`
- `processing`
- `completed`
- `rejected`

This phase does not process real payment provider refunds. Paystack/PayOnUs provider refund execution remains an admin/operations workflow to be implemented separately.
