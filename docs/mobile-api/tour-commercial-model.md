# Tour commercial model

This contract supersedes the former `Tour.startingFromNGN` payable-package model.
Execution, Driver actions, location publishing, tracking, journey intelligence and
provider settlement retain their existing endpoints and ownership rules.

[Tour coupons](./tour-coupons.md) apply after the authoritative subtotal/add-ons without
changing component prices. [Private feedback](./tour-feedback.md) is available only
after authoritative completion and is not a public Driver review.

## Catalogue

`GET /api/mobile/v1/tours` exposes only active canonical products, in this order:

1. `cotonou-city-tour` — Cotonou City Tour
2. `ouidah-tour` — Ouidah Tour
3. `ganvie-tour` — Ganvie Tour, **transportation only**

Each product has one operational Day. `transportationOnly`, `pickupServiceArea`
and `gogotinkpoAvailable` are explicit catalogue fields. Itinerary stop
`addonCode = gogotinkpo` identifies an optional stop, not a standard inclusion.
An addon is available only after Operations configures its actual stop location.

The Backoffice **Use Tour outline (names only)** action supplies these editable
standard stop names, without fabricated addresses or coordinates:

| Product           | Standard stops                                                      | Optional stop                       |
| ----------------- | ------------------------------------------------------------------- | ----------------------------------- |
| Cotonou City Tour | Graffiti Wall; Amazon Statue; Art Market; Abandoned Plane; Cornetto | Gogotinkpo (+20% of this component) |
| Ouidah Tour       | Point of No Return; Zinsou Foundation; Snake Temple; Casa del Papa  | None                                |
| Ganvie Tour       | Village on Water; Babs Dock                                         | None; transportation only           |

Operations may first save names-only Day/stop drafts and return later to select
actual addresses/coordinates. `TourItineraryStop.address`, `latitude` and
`longitude` are nullable together; a partial location is rejected. Catalogue
draft stops expose null location fields, never guessed values. Named stops with
no location report `missing_stop_coordinates` and block standard booking at the
backend. Operations quote approval still requires fully executable stops.
`20260918120000_tour_itinerary_draft_locations` changes template fields only;
operational `TourStopExecution` coordinates/address remain non-null.
The optional Gogotinkpo stop is added separately with
`addonCode = gogotinkpo`. Missing stop configuration returns
`executionReady = false`; a standard booking cannot bypass that gate.

The list also includes `vehicleCategories` (safe id/name/nameFr/capacity,
`pricingCategory`, `pricePerTour`) and `commercialRules`. The selected category
is a commercial choice; it never reserves a specific physical car.
Only available Vehicle categories linked to an active Tour rate are offered.
Operations maps categories under **Vehicle categories → Tour pricing category**.
GX460 and Odyssey require explicit mappings to qualifying categories; the backend
does not assume that every Prado is a GX460. Capacity comes from configuration.

All five **rate rows exist after migration**, including Odyssey and GX460.
The remaining mapping is `Vehicle.tourPricingCategory`, not a missing rate.
Under **Vehicle categories**, create or edit an available category and select
**Tour pricing category → Odyssey / GX460**, with its actual capacity. Associate
qualifying physical units under **Fleet units → Vehicle category**. Operations
assigns those units per booked Day later. No physical ID is a commercial price
key, and a GX460 commercial category does not imply all Prado units qualify.

## Authoritative pricing

`TourCommercialRate.priceMinor` is integer kobo per selected Tour:

| Pricing category | Initial NGN per Tour | Initial kobo |
| ---------------- | -------------------: | -----------: |
| sedan            |              100,000 |   10,000,000 |
| sienna           |              150,000 |   15,000,000 |
| suv              |              175,000 |   17,500,000 |
| odyssey          |              200,000 |   20,000,000 |
| gx460            |              200,000 |   20,000,000 |

Add 20% of **Cotonou's component only** when Gogotinkpo is selected. Other
components have zero addon. Traveller count does not multiply price but cannot
exceed the selected Vehicle category's configured capacity.

Backoffice edits rates under **Tours → Tour vehicle rates**. Rates use whole
naira multiples of 5 so the 20% addon remains compatible with the existing
integer-naira Payment/TourBooking amounts. Provider amounts still use kobo.
Rate changes apply to new bookings; stored booking amounts never change.
`startingFromNGN` is a discovery display value, not the payment authority.

## Quote and booking

Authenticated, fully onboarded Customer:

- `POST /api/mobile/v1/customer/tours/quote` returns `{ "quote": ... }`.
- `POST /api/mobile/v1/customer/tour-bookings/book` creates one combined booking.
- Existing `POST /api/mobile/v1/customer/tours/:tourId/book` remains available
  for one product; it requires `vehicleCategoryId` and also accepts `tourIds`.

```json
{
  "tourIds": ["cotonou-city-tour", "ouidah-tour", "ganvie-tour"],
  "vehicleCategoryId": "saloon",
  "gogotinkpo": true,
  "itineraryMode": "standard",
  "startDate": "2099-01-01",
  "travellers": 3,
  "pickup": {
    "label": "Selected Cotonou hotel",
    "address": "Customer-selected address",
    "coordinates": { "latitude": 6.37, "longitude": 2.43 }
  },
  "idempotencyKey": "customer-generated-request-key"
}
```

Coordinates above are examples. Booking ignores client prices. Quote previews
and creation share the same calculation; creation re-reads current configuration.
Dates are consecutive Days starting on `startDate`. Supplied selection order is
normalized to canonical order; Customer reordering is unsupported. Duplicate or
unknown selections and Gogotinkpo without Cotonou return `VALIDATION_ERROR` (400).

Quote includes `selectedTourIds`, `totalDays`, `itineraryMode`, `quoteRequired`,
`payable`, `vehicleCategory`, `pricing`, `standardEstimate`, `pickupServiceArea`.
For standard mode, `pricing` is the commercial snapshot below and
`standardEstimate` is null. For custom mode, `pricing` is null, `payable` is false
and `standardEstimate` is explicitly indicative, never an amount to charge.

Booking response is `{ "tourBooking": <existing DTO plus additions>,
"pricingBasis": "vehicle_per_selected_tour" }` (201; idempotent replay 200).
Custom creation uses `pricingBasis = operations_quote_required`; idempotent
replays use `existing-idempotency-key`, regardless of mode. The stored booking
`commercial.pricingBasis` remains the actual snapshot authority.
Additions:

```json
{
  "selectedTourIds": ["cotonou-city-tour", "ouidah-tour", "ganvie-tour"],
  "vehicleCategory": { "id": "saloon", "name": "Saloon Car", "capacity": 3 },
  "itineraryMode": "standard",
  "customItinerary": null,
  "quoteStatus": "not_required",
  "commercial": {
    "version": 1,
    "currency": "NGN",
    "pricingBasis": "vehicle_per_selected_tour",
    "components": [
      {
        "tourId": "cotonou-city-tour",
        "basePriceMinor": 10000000,
        "addonMinor": 2000000,
        "totalMinor": 12000000,
        "gogotinkpo": true,
        "transportationOnly": false
      },
      {
        "tourId": "ouidah-tour",
        "basePriceMinor": 10000000,
        "addonMinor": 0,
        "totalMinor": 10000000,
        "gogotinkpo": false,
        "transportationOnly": false
      },
      {
        "tourId": "ganvie-tour",
        "basePriceMinor": 10000000,
        "addonMinor": 0,
        "totalMinor": 10000000,
        "gogotinkpo": false,
        "transportationOnly": true
      }
    ],
    "totalMinor": 32000000,
    "priceNGN": 320000,
    "vehicleCategoryId": "saloon",
    "pricingCategory": "sedan",
    "quoteRequired": false
  }
}
```

Each booked Day also exposes `sourceTourId`, `sourceTourTitle`,
`transportationOnly`, `componentPriceMinor`, `gogotinkpo`.
These source/product snapshots persist independently of catalogue edits.
`tourId` remains the first selected canonical product for historical FK
compatibility. `selectedTourIds` defines the bundle. One booking/reference owns
its provider payments through the existing `Payment.tourBookingId` contract.
Driver `tour.day` exposes source identity, transportation-only and addon flags;
existing lifecycle/tracking fields remain compatible.

## Cotonou pickup

The backend reverse-geocodes selected coordinates using the established
server-only `GOOGLE_PLACES_API_KEY`. It accepts an authoritative Cotonou locality
and BJ country. It does not trust address text or a client city declaration.
No unapproved Cotonou polygon is invented in this pass. Unresolved or outside
coordinates fail closed with `TOUR_PICKUP_OUTSIDE_COTONOU` (400). Flutter can
offer **Book a ride to Cotonou**. Provider unavailability returns
`PLACE_SEARCH_UNAVAILABLE` (503), without leaking credentials.

One pickup is copied to all selected Days. Operations Day overrides use the
same territory check and retain the original booking-level Customer pickup.

## Custom itinerary quote gate

Set `itineraryMode = custom` and provide `customItinerary` (10–4000 characters).
Exact custom request to `POST /api/mobile/v1/customer/tour-bookings/book`:

```json
{
  "tourIds": ["ouidah-tour", "ganvie-tour"],
  "vehicleCategoryId": "<id from catalogue.vehicleCategories>",
  "gogotinkpo": false,
  "itineraryMode": "custom",
  "customItinerary": "Please review the requested custom stops and timings.",
  "startDate": "2099-01-01",
  "travellers": 3,
  "pickup": {
    "label": "Selected Cotonou hotel",
    "address": "Customer-selected address",
    "coordinates": { "latitude": 6.37, "longitude": 2.43 }
  },
  "idempotencyKey": "custom-request-unique-key"
}
```

Use real selected coordinates and a catalogue category ID; these are shape
examples, not seeded operational locations. Neither request accepts a payable
price. Unknown JSON fields are stripped, never used as commercial authority.
The request creates `status = quote_pending`, `quoteStatus = pending`,
`paymentStatus = pending`. `commercial.totalMinor` is null and
`commercial.standardEstimate` is explicitly a preview. The legacy integer
`priceNGN` column is initially zero, **not a free or confirmed booking**.
`payment.canInitialize` is false. Payment initialization returns
`TOUR_QUOTE_REQUIRED` (409) before any provider/zero-price path.
Unconfigured templates can receive custom requests; Operations must supply
a complete execution plan before approving a quote. Assignments are blocked
while the quote is pending. Unpaid quote-pending requests can be cancelled.

Backoffice **Tour bookings → Quote itinerary** edits the booking's Day/stop
snapshots and submits the full booking amount in NGN. It retains source product
identities, Day IDs and dates. No Customer itinerary reordering is introduced.

- `GET /api/admin/tour-bookings/:id/quote` returns the existing itinerary editor
  response shape with the booking's current revision.
- `PUT /api/admin/tour-bookings/:id/quote` requires `tours` permission and
  `{ "expectedUpdatedAt": "ISO timestamp", "priceNGN": 425000,
"days": [<existing itinerary day input>] }`.

Exactly one submitted Day per selected product, complete stops and validated
Cotonou pickup on every Day are required. The transaction locks the booking;
stale revisions, assigned/started Days, existing payments and repeated approvals
return 409. Invalid input returns 400; missing booking returns 404.
Approval changes `quoteStatus = approved`, `status = payment_pending` and freezes
the effective total in `commercial.totalMinor`. Payment providers and settlement
use that approved amount. Quotes cannot rewrite paid/executing bookings.

## Exact Customer wire contract

Catalogue is public. Quote, create, detail and payment require a Customer bearer
token and completed onboarding. No Customer userId is submitted.

`GET /api/mobile/v1/tours` returns:

```json
{
  "tours": ["<PublicTour objects>"],
  "vehicleCategories": [
    {
      "id": "<configured category id>",
      "name": "<name>",
      "nameFr": null,
      "capacity": 4,
      "pricingCategory": "sedan",
      "pricePerTour": {
        "currency": "NGN",
        "minorUnit": "kobo",
        "minorValue": 10000000,
        "value": 100000
      }
    }
  ],
  "commercialRules": {
    "pricingBasis": "vehicle_per_selected_tour",
    "travellersMultiplyPrice": false,
    "canonicalOrder": ["cotonou-city-tour", "ouidah-tour", "ganvie-tour"],
    "pickupServiceArea": { "city": "Cotonou", "countryCode": "BJ" },
    "gogotinkpo": { "tourId": "cotonou-city-tour", "componentSurchargePercent": 20 },
    "customItineraryRequiresOperationsQuote": true
  }
}
```

PublicTour retains `id`, `title`, `titleFr`, `destination`, `destinationFr`,
`country`, `countryFr`, `durationDays`, `startingFromNGN`, `image`, `description`,
`descriptionFr`, `highlights`, `highlightsFr`, `included`, `includedFr`,
`itineraryDays`, `executionReady`, `executionReadinessReason`, with the three
commercial fields listed above. Nullable translations fall back as defined in
the existing catalogue. Detail `GET /api/mobile/v1/tours/:tourId` returns
`{ "tour": <PublicTour> }`, or `TOUR_NOT_FOUND` (404).

Quote takes the standard/custom selection request above without needing
`idempotencyKey`. Its exact envelope is:

```json
{
  "quote": {
    "selectedTourIds": ["cotonou-city-tour", "ouidah-tour", "ganvie-tour"],
    "totalDays": 3,
    "itineraryMode": "standard",
    "quoteRequired": false,
    "payable": true,
    "vehicleCategory": { "id": "<category id>", "name": "<name>", "capacity": 4 },
    "pricing": "<commercial calculation snapshot without vehicle/quote metadata>",
    "standardEstimate": null,
    "pickupServiceArea": { "city": "Cotonou", "countryCode": "BJ" }
  }
}
```

For custom quotes: `quoteRequired = true`, `payable = false`, `pricing = null`,
and `standardEstimate` contains that same calculation snapshot. These placeholder
strings designate embedded objects, not literal wire strings.

`GET /api/mobile/v1/customer/tour-bookings/:tourBookingId` returns
`{ "tourBooking": <TourBooking DTO> }`. Its exact top-level fields are `id`,
`reference`, `tourId`, `selectedTourIds`, `vehicleCategory`, `itineraryMode`,
`customItinerary`, `quoteStatus`, `commercial`, `status`, `startDate`, `endDate`,
`travellers`, `pickup`, `price`, `payment`, `tour`, `progress`, `days`, `timestamps`.
Day/stop execution fields retain the frozen Tour V1 contract, plus the source/
component fields above. `quoteStatus` is `not_required`, `pending` or `approved`.
Refresh detail after Operations approval to observe the approved snapshot.
Do not show the custom request's legacy zero amount as a free checkout.

`POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/payment`:

```json
{ "provider": "paystack", "currency": "NGN", "locale": "en" }
```

Provider is `paystack` or `payonus` (default Paystack); currency defaults to NGN
and any other currency is rejected. Locale is `en`/`fr`, default `en`.
New initialization returns 201; reuse returns 200:

```json
{
  "payment": {
    "paymentId": "<id>",
    "tourBookingId": "<id>",
    "tourReference": "<reference>",
    "status": "pending",
    "amount": { "value": 320000, "currency": "NGN", "minorUnit": "kobo", "minorValue": 32000000 },
    "provider": "paystack",
    "paymentReference": "<reference>",
    "providerReference": "<provider reference>",
    "checkout": {
      "mode": "hosted_checkout",
      "checkoutUrl": "<url>",
      "authorizationUrl": "<url>",
      "accessCode": "<Paystack access code>"
    },
    "expiresAt": "<ISO timestamp>",
    "paidAt": null,
    "canRetry": false,
    "failureCode": null,
    "couponsSupported": true,
    "updatedAt": "<ISO timestamp>"
  },
  "reused": false,
  "zeroPayable": false
}
```

Reused initialization may additionally contain `payment.checkoutConfig` (null
for Paystack). PayOnUs retains `checkout.mode = payonus_checkout` and its existing
safe widget configuration (`businessId`, `amount`, `currency`, `customerEmail`,
`customerName`, `customerPhone`, `merchantCheckoutReference`, `countryCode`,
`notificationUrl`, `redirectUrl`, `environment`, `paymentMethods`). It never
includes a server secret. `checkout.accessCode` is nullable for PayOnUs.

`GET .../:tourBookingId/payment` returns
`{ "payment": <same payment status DTO>, "tourBooking": <booking DTO> }`.
`POST .../:tourBookingId/payment/verify` accepts
`{ "reference": "<optional payment reference>", "providerReference": "<optional provider reference>" }`
(both optional, `{}` accepted) and returns `{ "payment": <payment status DTO> }`.
SDK/widget success alone is not settlement: backend provider verification and
webhooks remain authoritative for status, amount, reference and ownership.
Paystack Tour checkout uses the same fixed Customer mobile navigation contract as
Ride checkout: success is `https://beninfy.com/en/mobile/payments/success` and
cancel is `https://beninfy.com/en/mobile/payments/cancel`. The cancel navigation
itself does not mutate state. Flutter then calls
`POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/cancel`; confirmed unpaid
cancellation returns `cancellation.cancelled = true`, while a concurrent settled
payment returns the authoritative state with `cancelled = false`.

All mobile errors use `{ "error": { "code": "...", "message": "..." } }`
with optional `details`. Relevant statuses: `VALIDATION_ERROR` 400,
`TOUR_BOOKING_DATE_INVALID` 400, `TOUR_TRAVELLER_COUNT_INVALID` 400,
`TOUR_PICKUP_OUTSIDE_COTONOU` 400, `TOUR_NOT_FOUND`/`TOUR_BOOKING_NOT_FOUND` 404,
`TOUR_NOT_EXECUTION_READY`/`TOUR_QUOTE_REQUIRED`/`TOUR_BOOKING_NOT_PAYABLE` 409,
`PAYMENT_ALREADY_COMPLETED` 409, `PLACE_SEARCH_UNAVAILABLE` 503,
`RATE_LIMITED` 429. Existing authentication/onboarding/payment-provider errors
retain the shared mobile contract. Traveller count must be 1–30 and also fit
the selected category's actual capacity. Date is a future/current `YYYY-MM-DD`
with no additional maximum horizon in the current Tour validator. Idempotency keys are optional
8–120-character strings matching `[A-Za-z0-9._:-]+`.

## Migration and history

`20260917120000_tour_commercial_model` is additive. Existing Tours default to
archived. Canonical records/rates are seeded without deleting legacy records.
Only unambiguous exact named Days from the legacy `benin-history-lake` template
are copied; coordinates are reused, never manufactured. Missing/ambiguous
templates require Operations configuration before standard booking. Existing
booking/Day snapshots keep their source references and are backfilled with source
Tour identity without changing lifecycle, payments or operational targets.

Deleting a referenced or canonical Tour archives it. Only unreferenced legacy
products may be deleted. Reactivation is permitted only for canonical products.
The migration has not been applied to production by this implementation task.

## Validation

`tests/tour-commercial.test.ts` exercises confirmed price matrices, component-only
addon, canonical order, one combined booking, capacity, unchanged snapshots,
territory rejection, archive filtering, shared quote/booking calculation,
custom-payment gating, Operations approval concurrency guards and vehicle
qualification. Existing Ride/Tour execution, tracking and payment regressions
continue to run in the full backend suite.

`tests/tour-commercial-database.test.ts` additionally exercises real PostgreSQL
migration preservation, template copying, seeded rates, all price combinations,
archive/deletion policy, nested-write rollback, idempotency, constraints, immutable
snapshots, concurrent quote approval and approved-amount payment initialization.
Database suites require explicitly configured disposable localhost databases;
they must be run serially when sharing canonical fixture products.

For migration/history coverage, use a **fresh** disposable database named
`beninfy_dispatch_test...`. Deploy all migrations preceding the commercial model
using a temporary migration directory/config; load
`tests/fixtures/tour-commercial-history.sql`; then deploy the complete migration
chain normally. Set `DATABASE_URL`, `DIRECT_URL`, `PRISMA_MIGRATE_URL`,
`TOUR_ITINERARY_TEST_DATABASE_URL` and `DRIVER_SEARCH_TEST_DATABASE_URL` to this
same localhost database and run:

```sh
node --import tsx --test --test-concurrency=1 tests/*.test.ts
```

Recreate the disposable fixture for each full migration verification: subsequent
template-edit tests intentionally replace the initial migration-copy template.
Never load this synthetic history fixture into staging or production.

Migration-schema comparison was also checked against an independently migrated
pre-change baseline. Three existing differences remain unchanged: the long
Driver assignment-history and OTP index names, and the Ride Payment booking FK
delete rule. The Tour commercial migration introduces no additional schema drift.

Release configuration: apply the migration through the approved staging process,
configure actual canonical stop locations, and map available Odyssey/GX460
categories before exposing those options. These are Operations configuration,
not Flutter hardcoded data or changes to execution/tracking architecture.
