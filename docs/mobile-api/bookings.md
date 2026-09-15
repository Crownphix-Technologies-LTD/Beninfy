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

## Authoritative Driver Assignment / Search (Ride V1)

Customer Booking Detail (including the successful booking-creation DTO) exposes
`booking.legs[].driverAssignmentStatus`. The selected-leg Customer tracking
snapshot exposes `tracking.driverAssignmentStatus`. Both use
`src/lib/driverAssignmentStatus.ts`. Booking list summaries and Driver/Tour DTOs
are unchanged. Round-trip legs have independent search state; use the selected
leg's value rather than aggregating outbound and return.

Values are exactly `not_searching`, `searching`, and `assigned`.

Persisted truth: `BookingLeg.driverSearchStatus` uses the Prisma enum
`DriverSearchStatus` (`idle` | `searching`). Existing and new rows default to
`idle`. This records an explicit Operations search decision; it does not start
automated matching or introduce a dispatch timer.

### Projection (evaluated in this order)

| Authoritative state                                                                                       | driverAssignmentStatus |
| --------------------------------------------------------------------------------------------------------- | ---------------------- |
| Booking is not confirmed (including pending, ops_review, cancelled, completed)                            | not_searching          |
| Leg is payment_pending, cancelled, completed, or an unknown/non-executable state                          | not_searching          |
| Confirmed executable leg has an actual driverId                                                           | assigned               |
| Confirmed leg is reserved, unassigned, or fleet-only assigned; persisted search is searching; no driverId | searching              |
| Everything else                                                                                           | not_searching          |

Executable assigned states include reserved, unassigned, assigned, dispatched,
driver_en_route, driver_arrived, passenger_onboard and in_progress. The actual
Driver relationship, not the generic leg status, establishes assignment.
Driver acceptance, movement and location publishing are not prerequisites.

`driver == null != searching` and `latestLocation == null != searching`.
Assignment is independent of trackingStatus/locationFresh. For example,
`driverAssignmentStatus = assigned` with `trackingStatus = unavailable` is valid.
Only `searching` authorizes the Customer "Finding your driver" animation. Stop it
when the next authoritative snapshot says assigned or not_searching. Before
this contract is available, a missing field must not be treated as searching.

### Operations ownership

On the existing Backoffice Bookings leg card, Operations sees Not searching,
Searching for Driver, or Driver assigned, with eligible Start/Stop controls.

`PATCH /api/admin/booking-legs/:id`, requiring existing `bookings` admin permission:

- Start: `{ "searchAction": "start" }`
- Stop: `{ "searchAction": "stop" }`

Send search actions separately from driver, fleet, status or notes changes.
Start requires a confirmed booking, a reserved/unassigned/assigned leg and no
Driver. Invalid starts return the existing admin-style 409 error; missing legs
return 404. Repeated valid starts and stops are idempotent. Stop sets idle and
never detaches an assigned Driver. Customer and Driver APIs cannot start search.

Real Driver assignment/reassignment atomically sets idle. Fleet-only assignment
does not count as Driver assignment and preserves an already explicit search.
Admin Driver removal sets idle. Driver decline/cancel clears the Driver and
returns the leg to unassigned + idle: current behavior returns work to Operations,
not an automatic search. Operations must explicitly start a replacement search.

Confirmation/payment settlement never starts search. A future reservation stays
idle until Operations explicitly starts it; there is no date/elapsed-time
heuristic. Operations may explicitly start preparation for a future departure.
Cancellation, completion and non-dispatchable transitions clear search. Entering
ops_review clears search; resolving the hold does not automatically restart it.
No timeout, failed, exhausted or paused dispatch states exist in V1.

### Concurrency and migration

Start locks the parent Booking against concurrent holds/cancellation, then uses a
conditional leg update that checks Driver absence and dispatch eligibility under
the row lock. Assignment writes Driver and idle together. The database CHECK
constraint also rejects searching with an attached Driver or an ineligible leg
status. Stop only writes idle, so it cannot undo assignment.

Migration: `20260915120000_driver_search_state`. Apply it before serving the new
application version. It adds one enum, one non-null column defaulting to idle,
and one CHECK constraint; it never backfills searching. Production migration and
application deployment are separate release operations.

### Verification

`node --import tsx --test tests/*.test.ts` includes projection regressions.
The PostgreSQL concurrency suite additionally requires both `DATABASE_URL` and
`DRIVER_SEARCH_TEST_DATABASE_URL` to point to the same disposable localhost
PostgreSQL database named `beninfy_dispatch_test...`, with migrations applied.
It is skipped when the dedicated test URL is absent. Never use production data.
