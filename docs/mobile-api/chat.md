# Mobile Chat API

Status: IMPLEMENTED backend REST/history/read state, PLANNED realtime provider delivery.

Trip chat is scoped to a `BookingLeg`. It is available only between the booking owner and the currently assigned driver.

## Eligibility

Writable:

- `assigned`
- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`

Read-only:

- writable statuses
- `completed`
- `cancelled`

Unavailable:

- `payment_pending`
- `reserved`
- `unassigned`
- no assigned driver

## Reassignment

Each assigned driver gets a separate conversation for the leg.

- Old driver loses access immediately when removed.
- New driver cannot read the previous driver's conversation.
- Customer can read trip chat history across driver conversations.

## Snapshot

Implemented:

`GET /api/mobile/v1/trips/:bookingLegId/chat`

Returns:

```json
{
  "chat": {
    "bookingLegId": "leg-id",
    "status": "open",
    "canSend": true,
    "canRead": true,
    "closeReason": null,
    "counterpart": {
      "type": "driver",
      "id": "driver-id",
      "name": "Driver Name"
    },
    "lastMessage": null,
    "unreadCount": 0,
    "realtime": {
      "provider": "supabase-broadcast",
      "channel": "trip:leg-id:chat",
      "permission": "subscribe",
      "events": ["chat.message_created"]
    }
  }
}
```

## List Messages

Implemented:

`GET /api/mobile/v1/trips/:bookingLegId/messages?limit=30&cursor=<messageId>`

Messages are returned newest-first. Use `pageInfo.nextCursor` to load older messages.

DTO:

```json
{
  "id": "message-id",
  "conversationId": "conversation-id",
  "bookingLegId": "leg-id",
  "senderType": "customer",
  "senderDisplayName": "Customer",
  "messageType": "text",
  "text": "Plain text message",
  "systemEventCode": null,
  "createdAt": "2026-08-15T12:00:00.000Z",
  "isOwnMessage": true
}
```

## Send Message

Implemented:

`POST /api/mobile/v1/trips/:bookingLegId/messages`

Request:

```json
{
  "text": "I am at the hotel lobby.",
  "clientMessageId": "optional-client-generated-id"
}
```

Rules:

- text-only
- max length defaults to `2000` characters
- empty/whitespace-only messages are rejected
- `clientMessageId` is used for retry idempotency
- backend derives sender from the mobile access token

## Mark Read

Implemented:

`POST /api/mobile/v1/trips/:bookingLegId/messages/read`

Read state is conversation participant level:

- customer uses `customerLastReadAt`
- driver uses `driverLastReadAt`

It is idempotent and account-level, not per device.

## Realtime

Channel:

```text
trip:{bookingLegId}:chat
```

Event:

```json
{
  "event": "chat.message_created",
  "version": 1,
  "bookingLegId": "leg-id",
  "conversationId": "conversation-id",
  "message": {
    "id": "message-id",
    "senderType": "driver",
    "text": "I have arrived.",
    "createdAt": "2026-08-15T12:00:00.000Z"
  }
}
```

Current backend returns signed channel metadata. Actual Supabase Broadcast delivery is planned.

## Push

Implemented through Phase 5 notification events:

- type: `chat.new_message`
- payload contains `bookingId`, `bookingLegId`, `conversationId`, `messageId`
- lock-screen copy does not include message text

Duplicate message retries reuse the persisted message and push dedupe is tied to `messageId`.

## Errors

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `TRIP_NOT_FOUND`
- `TRIP_NOT_ASSIGNED`
- `CHAT_NOT_AVAILABLE`
- `MESSAGE_EMPTY`
- `MESSAGE_TOO_LONG`
- `RATE_LIMITED`
- `VALIDATION_ERROR`

## Flutter Reconnect Strategy

1. Fetch snapshot.
2. Fetch latest message history.
3. Subscribe to realtime channel when available.
4. De-duplicate by message `id` between REST and realtime.
5. On reconnect, fetch history again using REST.
