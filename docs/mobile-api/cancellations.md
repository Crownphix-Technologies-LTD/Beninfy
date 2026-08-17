# Customer Cancellations Contract

Customer cancellation is backend-authoritative. Flutter must not locally mark a booking cancelled without the backend response.

## Endpoints

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `GET /api/mobile/v1/customer/booking-cancellation-reasons` | Public | Stable reason codes and note limit. |
| `POST /api/mobile/v1/customer/bookings/:bookingId/cancel` | Customer bearer token + completed onboarding | Cancels an owned eligible booking. |

## Reason Codes

- `change_of_plans`
- `wrong_booking_details`
- `duplicate_booking`
- `schedule_changed`
- `driver_delay`
- `price_issue`
- `other`

Flutter localizes labels using the returned `labelKey`. Optional customer note limit is 500 characters.

## Cancel Request

```json
{
  "reasonCode": "change_of_plans",
  "note": "Plans changed"
}
```

## Success Response

```json
{
  "cancellation": {
    "bookingId": "booking_id",
    "bookingStatus": "cancelled",
    "legs": [
      { "id": "leg_id", "direction": "outbound", "status": "cancelled" }
    ],
    "reasonCode": "change_of_plans",
    "supportFollowUpRequired": false,
    "idempotent": false
  }
}
```

## Policy

Allowed before execution reaches the active-trip cutoff. Blocking leg states:

- `driver_en_route`
- `driver_arrived`
- `passenger_onboard`
- `in_progress`

Completed bookings cannot be cancelled by the customer.

Duplicate cancellation is treated as idempotent success.

## Round Trips

Only whole-booking cancellation is supported. If any leg is already completed, partial cancellation is rejected with `PARTIAL_CANCELLATION_NOT_SUPPORTED`.

## Paid Bookings

Paid booking cancellation does not create a refund or alter payment records. The response sets `supportFollowUpRequired: true` so Flutter can direct the customer to support/admin refund review.

## Operational Impact

Cancellation marks non-completed legs `cancelled`, records reason metadata on the legs, releases driver assignment, expires latest tracking state, and relies on existing chat/tracking lifecycle rules:

- cancelled legs do not block fleet availability
- chat becomes read-only/closed
- tracking authorization ends
- old drivers cannot continue publishing location

Notifications reuse existing booking status and trip lifecycle notification infrastructure.
