# Routes Contract

`Route` represents a supported transport corridor, for example Lagos to Cotonou or Lome to Accra.

Mobile route discovery is backed by Prisma `Route` records. The backoffice `/admin/routes` screen is the operational source for customer-visible route metadata.

Implemented mobile endpoints:

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /api/mobile/v1/routes` | IMPLEMENTED | Public stable route DTOs and supported booking locations from available database routes. |
| `GET /api/mobile/v1/routes/:routeId` | IMPLEMENTED | Public route detail by id. Disabled routes are not returned. |

Mobile route DTOs expose only customer-safe fields:

- id
- origin city/code/country
- destination city/code/country
- displayName
- durationHours
- popular
- image
- description / descriptionFr
- borderCrossings
- available

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
