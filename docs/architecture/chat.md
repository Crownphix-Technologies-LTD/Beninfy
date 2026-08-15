# Trip-Scoped Chat Architecture

Status: IMPLEMENTED backend persistence/API, PLANNED realtime provider delivery.

Beninfy chat is not a general messaging system. It exists only inside an eligible `BookingLeg`.

## Domain Boundary

Authorization derives from:

- `Booking.userId` for the customer.
- `BookingLeg.driverId` for the currently assigned driver.
- `BookingLeg.status` for lifecycle eligibility.

Clients never submit trusted `customerId`, `driverId`, or `userId`.

## Eligibility

Writable chat is available only when the leg is:

- `assigned`
- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`

Read-only history is available for:

- the writable statuses above
- `completed`
- `cancelled`

Chat is unavailable for:

- `payment_pending`
- `reserved`
- `unassigned`
- any leg without an assigned driver

Completed/cancelled trips are immediately non-writable.

## Reassignment Policy

Conversations are per `BookingLeg` and per assigned driver.

- Old driver loses access as soon as they are no longer `BookingLeg.driverId`.
- New driver gets a separate conversation for the same leg.
- The new driver does not automatically see the old driver's conversation.
- The customer can read trip chat history across assignment conversations.
- Operations/admin chat visibility is future work and must be explicit and audited.

This is privacy-first while preserving customer support context.

## Realtime Boundary

Authoritative history is PostgreSQL. Realtime is delivery acceleration only.

Message send:

1. validate auth and lifecycle
2. persist `ChatMessage`
3. return stable DTO
4. attempt realtime event on `trip:{bookingLegId}:chat`
5. create a privacy-safe push event for the recipient

If realtime publish fails, the persisted message remains valid and the recipient can fetch it on reconnect.

## Retention

Chat history is persisted indefinitely for now because it is low-frequency and operationally useful. Future privacy work should define archival/export/deletion rules.
