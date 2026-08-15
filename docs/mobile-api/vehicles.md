# Vehicles Contract

Vehicle discovery is mobile-safe and category based.

Implemented endpoint:

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `GET /api/mobile/v1/vehicles` | Public | Returns active vehicle categories for customer booking UI. |

Success response:

```json
{
  "vehicles": [
    {
      "id": "saloon",
      "name": "Saloon Car",
      "nameFr": "Berline",
      "displayName": "Saloon Car",
      "capacity": 3,
      "luggageCapacity": 2,
      "available": true,
      "image": "/images/fleet/saloon.jpg",
      "description": "...",
      "descriptionFr": "...",
      "features": ["Air Conditioning"],
      "featuresFr": ["Climatisation"],
      "badge": "Premium Class",
      "badgeFr": "Classe Premium",
      "basePrice": null
    }
  ]
}
```

Fleet unit plate numbers, internal notes, and admin-only fields are not exposed here.
