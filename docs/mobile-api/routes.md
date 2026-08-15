# Routes Contract

`Route` represents a supported transport corridor, for example Lagos to Cotonou or Lome to Accra.

Mobile apps may read public route data to build booking forms and destination screens.

Current public/web sources:

- Static catalog: `src/data/routes.ts`
- API/admin-backed route data: `/api/admin/routes` for admin only
- Customer-facing route pages under `src/app/[locale]/routes/...`

Planned mobile endpoint:

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /api/mobile/v1/routes` | PLANNED | Public stable route DTOs. |
| `GET /api/mobile/v1/routes/:id` | PLANNED | Public route detail and available vehicle categories. |

Mobile route DTOs should include only customer-safe fields:

- id
- origin
- destination
- countries/cities
- active status
- display copy
- route media URL

Pricing must be fetched or calculated server-side. Flutter must not keep an authoritative price table.
