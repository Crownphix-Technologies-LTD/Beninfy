# Notifications Staging Test Plan

Do not send production notifications during this test. Use `PUSH_PROVIDER=mock` or `PUSH_PROVIDER=disabled`.

## Prerequisites

Apply pending migrations in this order:

1. `20260813120000_mobile_auth_foundation`
2. `20260815120000_scalability_concurrency_indexes`
3. `20260815140000_trip_lifecycle`
4. `20260815160000_realtime_location_foundation`
5. `20260815180000_push_notification_foundation`

## Test Flow

1. Log in as a customer from the customer Flutter app.
2. Register a customer push token with `POST /api/mobile/v1/devices/push-token`.
3. Log in as a driver from the driver Flutter app.
4. Register a driver push token with `POST /api/mobile/v1/devices/push-token`.
5. Assign a driver to a booking leg from the admin backoffice.
6. Verify a driver notification event exists for `trip.driver_assigned`.
7. Verify the customer receives or stores `trip.assignment_changed`.
8. Driver starts en route.
9. Verify customer notification event `trip.driver_en_route`.
10. Driver marks arrived.
11. Verify customer notification event `trip.driver_arrived`.
12. Driver starts and completes the trip.
13. Verify `trip.started` and `trip.completed` events.
14. Repeat the same lifecycle call or webhook retry where possible.
15. Verify dedupe prevents duplicate notification records for the same event occurrence.
16. Simulate an invalid-token provider response with a mock adapter/test.
17. Verify the backend marks only that device token invalid.
18. Register one English device and one French device.
19. Verify notification language resolution prefers the latest active device language and falls back to English.
20. Log out from the app and unregister the device token.
21. Verify future events for that user/app are `skipped_no_device` if no other active device exists.

## Expected Behavior

- Domain state changes succeed even when push delivery is disabled or fails.
- Customers cannot register driver tokens.
- Drivers cannot register customer tokens.
- Notification list pagination works.
- Mark-read can be called repeatedly without error.
- No GPS ping creates a push notification.
