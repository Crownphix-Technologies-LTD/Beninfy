# Saved Places

Saved places are customer-owned address shortcuts for the Flutter app.

Implemented endpoints:

- `GET /api/mobile/v1/customer/saved-places`
- `POST /api/mobile/v1/customer/saved-places`
- `PATCH /api/mobile/v1/customer/saved-places/:savedPlaceId`
- `DELETE /api/mobile/v1/customer/saved-places/:savedPlaceId`

All endpoints require a customer bearer token and completed onboarding.

Types:

- `home`
- `work`
- `custom`

Only one `home` and one `work` place are allowed per customer. This is enforced by service logic. `custom` places may have multiple records.

Request shape for create/update:

```json
{
  "type": "home",
  "label": "Home",
  "address": "Victoria Island, Lagos",
  "latitude": 6.4281,
  "longitude": 3.4219,
  "country": "Nigeria",
  "city": "Lagos",
  "providerPlaceId": "google-place-id"
}
```

Latitude and longitude must be supplied together when supplied.

Recent places are not exposed in this phase. Existing bookings store addresses but not a reliable provider place ID plus coordinates for every pickup/drop-off, so the backend must not pretend route cities are exact recent places.
