# Routes Contract

`Route` represents a supported transport corridor, for example Lagos to Cotonou or Lome to Accra.

Mobile apps may read public route data to build booking forms and destination screens.

Current public/web sources:

- Static catalog: `src/data/routes.ts`
- API/admin-backed route data: `/api/admin/routes` for admin only
- Customer-facing route pages under `src/app/[locale]/routes/...`

Implemented mobile endpoints:

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /api/mobile/v1/routes` | IMPLEMENTED | Public stable route DTOs and supported booking locations. |
| `GET /api/mobile/v1/routes/:routeId` | IMPLEMENTED | Public route detail by id. |

Mobile route DTOs should include only customer-safe fields:

- id
- origin
- destination
- countries/cities
- active status
- display copy
- route media URL

Pricing must be fetched or calculated server-side. Flutter must not keep an authoritative price table.

`GET /api/mobile/v1/routes` success response:

```json
{
  "routes": [
    {
      "id": "lagos-cotonou",
      "origin": { "city": "Lagos", "code": "LOS", "country": "Nigeria" },
      "destination": { "city": "Cotonou", "code": "COT", "country": "Benin Republic" },
      "displayName": "Lagos to Cotonou",
      "durationHours": 3.5,
      "popular": true,
      "image": "/images/routes/lagos-cotonou.jpg",
      "description": "...",
      "descriptionFr": "...",
      "borderCrossings": ["Seme-Krake"],
      "available": true
    }
  ],
  "locations": [{ "city": "Lagos", "country": "Nigeria" }]
}
```
