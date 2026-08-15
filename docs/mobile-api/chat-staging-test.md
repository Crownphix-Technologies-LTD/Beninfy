# Chat Staging Test Plan

Do not run production tests. Apply migrations through:

1. `20260813120000_mobile_auth_foundation`
2. `20260815120000_scalability_concurrency_indexes`
3. `20260815140000_trip_lifecycle`
4. `20260815160000_realtime_location_foundation`
5. `20260815180000_push_notification_foundation`
6. `20260815200000_trip_chat_foundation`

## Flow

1. Customer logs in.
2. Driver logs in.
3. Admin assigns driver to a confirmed `BookingLeg`.
4. Customer opens `GET /api/mobile/v1/trips/:bookingLegId/chat`.
5. Driver opens the same snapshot endpoint.
6. Customer sends a message.
7. Verify message persisted and realtime event payload is returned.
8. Driver fetches messages and sees the customer message.
9. Driver replies.
10. Customer fetches messages and sees the driver reply.
11. Disconnect customer client.
12. Driver sends another message.
13. Customer reconnects and fetches missed message through REST.
14. Verify `chat.new_message` notification event exists.
15. Mark read with `POST /messages/read`.
16. Verify unread count resets.
17. Driver declines or admin reassigns the leg.
18. Old driver can no longer list or send messages.
19. New driver gets access to a separate conversation.
20. Verify new driver cannot see previous driver's messages.
21. Customer can still read trip chat history across conversations.
22. Complete the trip.
23. Sending is blocked with `CHAT_NOT_AVAILABLE`.
24. History remains readable.
25. Unauthorized customer tries another booking leg and gets `FORBIDDEN`.
26. Unauthorized driver tries another driver's leg and gets `FORBIDDEN`.
27. Retry send with the same `clientMessageId`.
28. Verify no duplicate message and no duplicate push notification.
