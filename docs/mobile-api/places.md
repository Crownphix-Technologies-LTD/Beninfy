# Mobile Places Search

Mobile clients must not call Google Places or Geocoding directly with the backend credential. The backend owns Google Places API (New) and Geocoding API reverse lookup calls and returns only customer-safe fields.

## Environment

Required server-only variable:

- `GOOGLE_PLACES_API_KEY`

This key must not be named with `NEXT_PUBLIC_`. Enable Places API (New) and Geocoding API in the existing Google Cloud project and restrict this key for backend/server usage. Android and iOS Maps SDK keys remain separate platform-restricted app keys.

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

## Reverse Geocoding

`GET /api/mobile/v1/places/reverse?latitude=6.369&longitude=2.432&locale=en|fr`

`languageCode=en|fr` is also accepted as an alias for `locale`.

Authentication: mobile customer bearer token.

Rate limit: per customer and request IP.

Provider: Google Geocoding API reverse geocoding through the backend.

Success when Google returns an authoritative locality/postal town and country:

```json
{
  "place": {
    "placeId": "ChIJ...",
    "displayName": "Rue Bel Air, Cotonou, Benin",
    "formattedAddress": "Rue Bel Air, Cotonou, Benin",
    "latitude": 6.369,
    "longitude": 2.432,
    "city": "Cotonou",
    "country": "Benin",
    "countryCode": "BJ",
    "resolved": true
  },
  "unresolved": false,
  "attribution": { "provider": "google_geocoding" }
}
```

Safe unresolved response when Google returns an address/region but no reliable city:

```json
{
  "place": {
    "placeId": "ChIJ...",
    "displayName": "Littoral Department, Benin",
    "formattedAddress": "Littoral Department, Benin",
    "latitude": 6.37,
    "longitude": 2.39,
    "city": null,
    "country": null,
    "countryCode": null,
    "resolved": false
  },
  "unresolved": true,
  "attribution": { "provider": "google_geocoding" }
}
```

Flutter should treat `resolved: false` or `city: null` as "current location could not be matched to a supported booking city" and ask the customer to choose a pickup address manually.

## Route City Boundary Validation

Availability, quote, and booking creation validate that selected places belong to the selected route endpoints.

For a route:

```text
Cotonou -> Lome
```

the payload must include normalized location evidence from Place Details, Saved Places, or backend reverse geocoding:

```json
{
  "pickupCity": "Cotonou",
  "pickupCountry": "Benin",
  "pickupCountryCode": "BJ",
  "destinationCity": "Lomé",
  "destinationCountry": "Togo",
  "destinationCountryCode": "TG"
}
```

`dropoffCity`, `dropoffCountry`, and `dropoffCountryCode` are accepted aliases for destination fields in booking payloads.

These city/locality values are treated as location evidence for backend service-area validation. Route endpoint cities are not rewritten to the selected locality.

Stable boundary errors:

- `PICKUP_OUTSIDE_ROUTE_CITY`
- `DESTINATION_OUTSIDE_ROUTE_CITY`
- `LOCATION_CITY_UNRESOLVED`

Example error:

```json
{
  "error": {
    "code": "PICKUP_OUTSIDE_ROUTE_CITY",
    "message": "Your pickup location must be within the Cotonou service area",
    "details": {
      "field": "pickup",
      "expectedCity": "Cotonou",
      "expectedCountry": "Benin Republic",
      "expectedCountryCode": "BJ",
      "resolvedCity": "Porto-Novo",
      "resolvedCountry": "Benin",
      "resolvedCountryCode": "BJ"
    }
  }
}
```

Known Beninfy aliases are normalized centrally, including `Lomé/Lome`, `Porto-Novo/Porto Novo`, and `Kpalimé/Kpalime`. A matching locality with a conflicting country code is rejected.

## Booking Authority

Places search does not make arbitrary city pairs bookable. Flutter may use the returned address, coordinates and extracted city to prefill booking, but the booking endpoint remains authoritative:

- supported route pair comes from Beninfy route catalog
- fare comes from backend pricing
- availability comes from backend fleet reservation logic
- pickup and destination places must belong to the configured service areas for the selected route endpoints
- unsupported city pairs remain rejected by the booking API

Reverse geocoding does not make arbitrary GPS locations bookable. The booking API still matches the selected route against the Beninfy route catalog and validates pickup/dropoff service-area membership. Current-location pickup must first pass backend reverse geocoding and then route service-area validation.

Booking creation already accepts and persists:

- `pickupAddress`
- `pickupLatitude`
- `pickupLongitude`
- `dropoffAddress`
- `dropoffLatitude`
- `dropoffLongitude`

Flutter must never send route price, route availability, Google credentials, OTP secrets, or authoritative verification state.
