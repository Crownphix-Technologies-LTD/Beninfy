# Mobile Places Search

Mobile clients must not call Google Places directly with the backend credential. The backend owns Google Places API (New) calls and returns only customer-safe fields.

## Environment

Required server-only variable:

- `GOOGLE_PLACES_API_KEY`

This key must not be named with `NEXT_PUBLIC_`. Enable Places API (New) in the existing Google Cloud project and restrict this key for backend/server usage. Android and iOS Maps SDK keys remain separate platform-restricted app keys.

## Autocomplete

`GET /api/mobile/v1/places/autocomplete?q=<query>&locale=en|fr&limit=1..8`

`languageCode=en|fr` is also accepted as an alias for `locale`.

Authentication: mobile customer bearer token.

Rate limit: per customer and request IP.

Success:

```json
{
  "places": [
    {
      "placeId": "ChIJ...",
      "displayName": "Cadjehoun Airport",
      "formattedAddress": "Cotonou, Benin",
      "latitude": null,
      "longitude": null,
      "city": null,
      "country": null,
      "countryCode": null
    }
  ],
  "attribution": { "provider": "google_places" }
}
```

Autocomplete supports addresses, hotels, airports, landmarks and other places returned by Google in Nigeria, Benin, Togo and Ghana.

## Place Details

`GET /api/mobile/v1/places/:placeId?locale=en|fr`

`languageCode=en|fr` is also accepted as an alias for `locale`.

Authentication: mobile customer bearer token.

Success:

```json
{
  "place": {
    "placeId": "ChIJ...",
    "displayName": "Hotel du Lac",
    "formattedAddress": "Rue Bel Air, Cotonou, Benin",
    "latitude": 6.369,
    "longitude": 2.432,
    "city": "Cotonou",
    "country": "Benin",
    "countryCode": "BJ"
  },
  "attribution": { "provider": "google_places" }
}
```

## Booking Authority

Places search does not make arbitrary city pairs bookable. Flutter may use the returned address, coordinates and extracted city to prefill booking, but the booking endpoint remains authoritative:

- supported route pair comes from Beninfy route catalog
- fare comes from backend pricing
- availability comes from backend fleet reservation logic
- unsupported city pairs remain rejected by the booking API

Booking creation already accepts and persists:

- `pickupAddress`
- `pickupLatitude`
- `pickupLongitude`
- `dropoffAddress`
- `dropoffLatitude`
- `dropoffLongitude`

Flutter must never send route price, route availability, Google credentials, OTP secrets, or authoritative verification state.
