# Customer Guest Discovery Contract

Guest discovery is deliberately separate from authenticated Customer ownership APIs. It supports
location discovery and server-authoritative previews without creating a Booking, Payment, Customer
record, or anonymous owner.

## Public catalogue

- `GET /api/mobile/v1/routes`
- `GET /api/mobile/v1/routes/:routeId`
- `GET /api/mobile/v1/vehicles`
- `GET /api/mobile/v1/tours`
- `GET /api/mobile/v1/tours/:tourId`

## Guest Places

- `GET /api/mobile/v1/guest/places/autocomplete?q=...&locale=en|fr&limit=1..8`
- `GET /api/mobile/v1/guest/places/:placeId?locale=en|fr`
- `GET /api/mobile/v1/guest/places/reverse?latitude=...&longitude=...&locale=en|fr`

Responses use the existing safe Place DTO: `placeId`, `displayName`, `formattedAddress`,
`latitude`, `longitude`, `city`, `country`, and `countryCode`. Google credentials remain on the
backend. Autocomplete is bounded to 2-120 characters and at most eight results.

## Guest Ride availability

`POST /api/mobile/v1/guest/availability`

The request is the existing Ride discovery selection without `fleetVehicleId` or `couponCode`.
The response contains the public route and vehicle, normalized trip inputs, service-area/fare-zone
resolution, and category-level `availability.status`, `availability.available`, and per-date
availability booleans. It does not expose FleetVehicle IDs, labels, counts, cities, status, or
selectable physical units.

## Guest Ride quote

`POST /api/mobile/v1/guest/rides/quote`

The request is the same guest Ride selection. Pricing is recalculated from current backend route,
vehicle, fare-zone, border-fee and availability configuration. The response contains the existing
money/pricing breakdown, `coupon: null`, `informationalOnly: true`, and
`revalidationRequired: true`. Guest coupon eligibility is not evaluated.

## Guest Tour quote

`POST /api/mobile/v1/guest/tours/quote`

The request accepts the canonical Tour selection, one configured vehicle category, pickup,
traveller count and start date. Standard and custom-itinerary previews retain the existing Tour
commercial rules. The response is informational and requires authenticated revalidation.

## Limits

All guest operations are IP-rate-limited. Places limits per 15 minutes are 30 autocomplete, 45
details, and 20 reverse-geocoding requests. Availability allows 20 and each quote endpoint allows
15 requests per 15 minutes. Guest POST bodies are capped at 16 KiB. Responses use `no-store`.

## Authentication handoff

Guest state is local discovery state only. After sign-in, Flutter submits the selected inputs to the
existing authenticated availability/quote flow and then creates the Booking through the existing
Customer endpoint. The backend recalculates current availability, pricing and Customer coupon
eligibility. A guest response is never accepted as a price or availability guarantee.

Booking creation, payment, coupons, history, Saved Travellers, notifications, chat, profile and
account routes remain authenticated.
