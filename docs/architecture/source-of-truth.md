# Backoffice Source of Truth

Operational production data flows through the database:

Backoffice -> Prisma/PostgreSQL -> route, pricing, border-fee, and availability services -> Web and `/api/mobile/v1` -> customer and driver apps.

## Authoritative Records

- `Route`: customer-visible route catalogue, origin/destination labels, country/code metadata, route media, border crossings, `available`, and `borderFeeIds`.
- `BorderFee`: customer-visible border support fee records.
- `RoutePrice`: route/category and route/fleet-unit fare records.
- `Vehicle`: customer-visible vehicle categories.
- `FleetVehicle`: physical fleet units, plate numbers, colors, operational status, and assignment inventory.
- `VehicleBlock` and `BookingLeg`: fleet availability constraints.

## Legacy Static Files

- `src/data/routes.ts`: seed/import source only.
- `src/data/borderFees.ts`: seed/import source only.
- `src/data/pricing.ts`: seed/import source plus pickup-area policy helpers.

Runtime booking creation, mobile route discovery, mobile quote, server route pages, sitemap, border-info pages, and payment confirmation fallback must not silently use the static files as production truth.

Client-side public ride preview screens may still contain legacy display helpers while checkout is being completed, but the booking write path recalculates on the server from Prisma.

## Import Strategy

Use `scripts/import-operational-catalog.ts` after applying the additive migration. The script:

- creates missing routes, border fees, and route prices;
- preserves existing database/backoffice values;
- backfills empty `Route.borderFeeIds` from legacy route mappings;
- reports preserved/created counts.

Do not run it automatically against production. Run it intentionally during staging/production data preparation.

## Final Map

Backoffice
-> Prisma/PostgreSQL
-> Route/Pricing/Availability services
-> Web and Mobile API
-> Customer Flutter

Backoffice fleet/driver assignment
-> Prisma/PostgreSQL
-> Driver/mobile trip services
-> Driver Flutter
