# Reviews

Trip reviews are tied to completed booking legs, not whole bookings.

Implemented endpoints:

- `POST /api/mobile/v1/customer/trips/:bookingLegId/review`
- `GET /api/mobile/v1/customer/reviews`
- `GET /api/mobile/v1/customer/reviews/:reviewId`

All endpoints require a customer bearer token and completed onboarding.

Create request:

```json
{
  "rating": 5,
  "tags": ["professional_driver", "clean_vehicle", "safe_trip"],
  "comment": "Smooth border support and clear communication."
}
```

Rules:

- The customer must own the booking.
- The leg must be `completed`.
- The leg must have an assigned driver.
- Only one review is allowed per leg.
- Reviews are immutable in this phase.

Stable tags:

- `professional_driver`
- `clean_vehicle`
- `on_time`
- `smooth_border_crossing`
- `safe_trip`
- `good_communication`
- `needs_improvement`

Driver aggregates are internal only and are not exposed publicly in this phase.
