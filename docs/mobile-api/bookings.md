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
- `POST /api/mobile/v1/customer/bookings/:bookingId/cancel`
- `GET /api/mobile/v1/customer/booking-cancellation-reasons`

The Phase 2 creation endpoint adapts the existing web booking route to avoid duplicating pricing and fleet availability rules. It still needs a Phase 3 service extraction and idempotency key support before heavy mobile traffic.

Before creating a booking, Flutter should:

1. Load `GET /api/mobile/v1/routes`.
2. Load `GET /api/mobile/v1/vehicles`.
3. Let the customer choose a route, trip dates, passenger count, vehicle category, pickup/dropoff places, and optionally a fleet unit.
4. Call `POST /api/mobile/v1/availability` for the selected date/category/fleet unit.
5. Call `POST /api/mobile/v1/pricing/quote`.
6. Create the booking with `POST /api/mobile/v1/customer/bookings` using the same selection fields.

The booking creation endpoint remains authoritative and can reject a stale quote if the selected vehicle becomes unavailable.

Route matching is bidirectional for supported Beninfy corridors. Flutter may send the selected `routeId` from discovery or compatible `from`/`to` city fields, but the backend still resolves the authoritative corridor, price source, border fees, and availability. Flutter must not create local reverse routes.

Booking creation recomputes the passenger-aware border fee server-side using the existing route `borderFeeIds` and the submitted passenger count. Client-submitted totals or display-only fee calculations are never authoritative.

Booking creation repeats route service-area validation. The final booking payload must include normalized place locality/country fields for the selected route:

```json
{
  "pickupAddress": "Rue Bel Air, Cotonou",
  "pickupLatitude": 6.3703,
  "pickupLongitude": 2.3912,
  "pickupCity": "Cotonou",
  "pickupCountryCode": "BJ",
  "dropoffAddress": "Lomé city centre",
  "dropoffLatitude": 6.1725,
  "dropoffLongitude": 1.2314,
  "dropoffCity": "Lomé",
  "dropoffCountryCode": "TG"
}
```

Customer Flutter should localize:

- `PICKUP_OUTSIDE_ROUTE_CITY`: "Your pickup location must be within the {expectedCity} service area."
- `DESTINATION_OUTSIDE_ROUTE_CITY`: "Your destination must be within the {expectedCity} service area."
- `LOCATION_CITY_UNRESOLVED`: ask the customer to search/select another location.

French copy:

- `PICKUP_OUTSIDE_ROUTE_CITY`: "Votre lieu de prise en charge doit se trouver dans la zone desservie de {expectedCity}."
- `DESTINATION_OUTSIDE_ROUTE_CITY`: "Votre destination doit se trouver dans la zone desservie de {expectedCity}."

Lagos pickup fare zone is backend-resolved from the pickup place only when the selected route origin is Lagos. Flutter must not show an editable Mainland/Island dropdown. If the quote/availability response includes `pickupFareZone`, it may be displayed as read-only.

Customer cancellation is whole-booking only in this phase. Partial return-leg cancellation after an outbound leg has completed is not supported.
