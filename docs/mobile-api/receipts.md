# Receipts

Implemented endpoint:

- `GET /api/mobile/v1/customer/bookings/:bookingId/receipt`

Requires a customer bearer token and completed onboarding.

The receipt is generated from authoritative booking and payment records only.

The response includes:

- booking reference
- passenger contact snapshot
- trip details
- vehicle category
- booking total
- discount
- amount paid
- balance due
- payment records

No fake VAT, tax, or unstored historical fare components are generated. PDF receipt generation is deferred until the exact legal receipt format is approved.
