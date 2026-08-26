# Routes Contract

`Route` represents a supported transport corridor, for example Lagos to Cotonou or Lome to Accra.

Mobile route discovery is backed by Prisma `Route` records. The backoffice `/admin/routes` screen is the operational source for customer-visible route metadata.

Supported Beninfy corridors are bidirectional unless a future explicit one-way flag is introduced. If only `Lagos -> Cotonou` exists in the database, mobile discovery can expose a generated `Cotonou -> Lagos` projection. If an explicit reverse database record exists, the explicit record wins and no duplicate generated reverse is returned.

Implemented mobile endpoints:

| Endpoint                             | Status      | Notes                                                                                    |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| `GET /api/mobile/v1/routes`          | IMPLEMENTED | Public stable route DTOs and supported booking locations from available database routes. |
| `GET /api/mobile/v1/routes/:routeId` | IMPLEMENTED | Public route detail by id. Disabled routes are not returned.                             |

Mobile route DTOs expose only customer-safe fields:

- id
- canonicalRouteId
- pricingRouteId
- direction
- origin city/code/country and read-only service area metadata
- destination city/code/country and read-only service area metadata
- displayName
- durationHours
- popular
- image
- description / descriptionFr
- borderCrossings
- available

Route ID behavior:

- explicit database routes keep their normal `id`.
- generated reverse projections use a stable synthetic id ending in `__reverse`.
- `canonicalRouteId` identifies the corridor.
- `pricingRouteId` identifies the authoritative route price/border-fee source used by the backend.
- Flutter should pass the selected `id`; it must not calculate pricing from `pricingRouteId`.

For generated reverse projections, origin/destination are swapped and `borderCrossings` are returned in reverse traversal order with directional labels swapped where possible.

Pricing must be fetched or calculated server-side. Flutter must not keep an authoritative price table.

Route endpoint cities represent Beninfy service areas, not necessarily exact Google locality names. For example, a Lagos route endpoint may accept explicitly configured Lagos service-area localities such as Ikeja, Lekki, Badagry, or Ikorodu without rewriting the route from `Accra -> Lagos` to `Accra -> Badagry`. The backend validates service-area membership and country code; Flutter must not keep locality allow-lists.

`GET /api/mobile/v1/routes` success response:

```json
{
  "routes": [
    {
      "id": "lagos-cotonou",
      "canonicalRouteId": "lagos-cotonou",
      "pricingRouteId": "lagos-cotonou",
      "direction": "explicit",
      "origin": {
        "city": "Lagos",
        "code": "LOS",
        "country": "Nigeria",
        "serviceArea": { "city": "Lagos", "countryCode": "NG" }
      },
      "destination": {
        "city": "Cotonou",
        "code": "COT",
        "country": "Benin Republic",
        "serviceArea": { "city": "Cotonou", "countryCode": "BJ" }
      },
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
