# Customer Mobile Payments

Status: IMPLEMENTED customer booking payment initiation, status, and server-side verification recovery.

The Customer Flutter app must not calculate, trust, or settle payment amounts. The backend remains authoritative for fare, currency, provider verification, booking confirmation, fleet reservation, amount mismatch, and ops review.

## Existing Flow Findings

Reusable backend logic already exists for:

- Paystack hosted checkout initialization and verification.
- PayOnUs checkout configuration and verification.
- Webhook signature validation.
- `markPaymentPaidAndReserveBooking` settlement.
- Fleet availability recheck after payment.
- `ops_review` when payment succeeds but physical fleet reservation conflicts.
- Amount mismatch handling.
- Branded emails and Phase 5 push notification hooks.

Web-specific behavior remains in `/api/payments/initiate` and browser redirect URLs. Phase 7 adds mobile-safe customer endpoints without replacing the existing web flow.

## Provider Strategy

Implemented providers:

- `paystack`: backend creates a Paystack transaction and returns hosted checkout metadata.
- `payonus`: backend creates a local payment attempt and returns the PayOnUs checkout config expected by the PayOnUs widget/SDK.

Flutter may request `provider: "paystack"` or `provider: "payonus"`. Backend configuration may reject an unavailable provider.

## Initiate Payment

Implemented:

`POST /api/mobile/v1/customer/bookings/:bookingId/payment`

Request:

```json
{
  "provider": "paystack",
  "locale": "en"
}
```

Rules:

- Authenticated customer must own the booking.
- Booking must be payable.
- Already paid bookings do not create another charge.
- Client-supplied amount is ignored; backend uses `Booking.priceNGN`.
- Duplicate active pending attempts for the same provider return the existing attempt while it is unexpired.

Response:

```json
{
  "payment": {
    "paymentId": "payment-id",
    "bookingId": "booking-id",
    "status": "pending",
    "amount": {
      "value": 180000,
      "currency": "NGN",
      "minorUnit": "kobo",
      "minorValue": 18000000
    },
    "provider": "paystack",
    "paymentReference": "BFY-M-ABC123-001122",
    "providerReference": "BFY-M-ABC123-001122",
    "checkout": {
      "mode": "hosted_checkout",
      "checkoutUrl": "https://checkout.paystack.com/...",
      "authorizationUrl": "https://checkout.paystack.com/...",
      "accessCode": "access-code"
    },
    "expiresAt": "2026-08-15T12:30:00.000Z",
    "paidAt": null,
    "canRetry": false,
    "failureCode": null,
    "updatedAt": "2026-08-15T12:00:00.000Z"
  },
  "reused": false
}
```

For PayOnUs, the response also includes `payment.checkoutConfig` with widget/SDK config values. No PayOnUs client secret is exposed.

## Payment Status

Implemented:

`GET /api/mobile/v1/customer/bookings/:bookingId/payment`

Use this after app restart, checkout return, network interruption, or notification receipt. Backend state remains authoritative.

## Manual Verification / Recovery

Implemented:

`POST /api/mobile/v1/customer/bookings/:bookingId/payment/verify`

Request:

```json
{
  "reference": "optional-payment-reference",
  "providerReference": "optional-provider-reference"
}
```

This endpoint calls provider verification server-side and then uses the existing settlement logic. It is idempotent. Flutter must never mark payment as paid locally.

## Checkout Return Strategy

For hosted checkout, Flutter should use an external browser/deep-link or provider-supported SDK flow. A redirect/deep-link result is only UX information. Flutter must fetch the status endpoint after return.

Recommended recovery:

1. Fetch status immediately on return.
2. Poll briefly with backoff while status is `pending`.
3. Stop when status is terminal: `paid`, `failed`, `amount_mismatch`, or `ops_review`.
4. Resume polling from status endpoint after app restart.

## Status Values

- `pending`
- `paid`
- `failed`
- `amount_mismatch`
- `ops_review`

## Safe Error Codes

- `PAYMENT_FAILED`
- `PAYMENT_CANCELLED`
- `PAYMENT_EXPIRED`
- `PAYMENT_AMOUNT_MISMATCH`
- `PAYMENT_ALREADY_COMPLETED`
- `BOOKING_NOT_PAYABLE`
- `PAYMENT_PROVIDER_UNAVAILABLE`
- `BOOKING_NOT_FOUND`
- `PAYMENT_NOT_FOUND`
- `FORBIDDEN`
- `RATE_LIMITED`

Flutter handles EN/FR display.

## Security

Flutter never receives:

- Paystack secret key
- PayOnUs client secret
- webhook secrets
- provider raw verification payloads
- database credentials

## Cancellation / Abandoned Checkout

Pending payments remain pending until provider verification/webhook reports a terminal state or operational reconciliation marks them failed. A stale pending payment must not confirm a cancelled booking because settlement still checks booking/fleet state.

## Payment History

Not implemented in Phase 7. Current mobile product flow needs payment status per booking, not a standalone payment ledger screen.
