# Mobile Payments Staging Test Plan

Do not run production transactions. Use provider sandbox/test credentials only.

Apply migrations through:

1. `20260813120000_mobile_auth_foundation`
2. `20260815120000_scalability_concurrency_indexes`
3. `20260815140000_trip_lifecycle`
4. `20260815160000_realtime_location_foundation`
5. `20260815180000_push_notification_foundation`
6. `20260815200000_trip_chat_foundation`
7. `20260815220000_mobile_payment_flow`

## Flow

1. Customer logs in.
2. Customer creates a booking.
3. Initiate payment with `POST /customer/bookings/:bookingId/payment`.
4. Inspect mobile-safe payment DTO; confirm no provider secrets or raw provider payloads.
5. Complete sandbox payment with Paystack or PayOnUs.
6. Confirm provider webhook hits `/api/payments/webhook`.
7. Fetch `GET /customer/bookings/:bookingId/payment`.
8. Verify payment state is `paid`.
9. Verify booking is `confirmed` or `ops_review` if fleet conflict is simulated.
10. Send duplicate webhook and verify no duplicate notification/email behavior.
11. Repeat duplicate initiation while pending and verify the same active attempt is returned.
12. Simulate failed payment and verify safe failure code.
13. Cancel/abandon checkout and verify booking is not confirmed from client callback alone.
14. Simulate amount mismatch and verify booking is not normally confirmed.
15. Simulate fleet conflict after payment and verify booking moves to `ops_review`.
16. Try initiating payment for an already paid booking and verify no second charge is created.
17. Unauthorized customer attempts payment access and receives not found/forbidden behavior.
18. Restart app after hosted checkout and recover through status endpoint.
19. Verify EN/FR push/email display remains client/template responsibility.

## Provider URLs

Webhook URL:

```text
https://YOUR_STAGING_DOMAIN/api/payments/webhook
```

Hosted checkout return/deep link is user-experience only. The app must fetch backend status after return.
