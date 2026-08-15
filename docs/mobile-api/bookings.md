# Bookings Contract

`Booking` is the customer commercial order.

It contains:

- Customer/user relationship
- Route direction
- Passenger and traveller manifest
- Pickup/dropoff addresses
- Trip type
- Total price
- Payment relationship
- Overall commercial status

Examples:

```text
ONE WAY

Booking
└── BookingLeg OUTBOUND
```

```text
ROUND TRIP

Booking
├── BookingLeg OUTBOUND
└── BookingLeg RETURN
```

Mobile clients must use DTOs such as `CustomerBookingSummaryDto` and `CustomerBookingDetailDto`; they must not consume raw Prisma `Booking` objects.

Implemented mobile endpoints:

- `GET /api/mobile/v1/customer/bookings`
- `GET /api/mobile/v1/customer/bookings/:bookingId`
- `POST /api/mobile/v1/customer/bookings`

The Phase 2 creation endpoint adapts the existing web booking route to avoid duplicating pricing and fleet availability rules. It still needs a Phase 3 service extraction and idempotency key support before heavy mobile traffic.
