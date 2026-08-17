# Customer Settings Contract

Settings are minimal and account-scoped.

## Endpoints

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `GET /api/mobile/v1/customer/settings` | Customer bearer token | Returns customer settings. |
| `PATCH /api/mobile/v1/customer/settings` | Customer bearer token + completed onboarding | Updates supported settings. |

## Locale

Allowed values:

- `en`
- `fr`

Request:

```json
{ "locale": "fr" }
```

Response:

```json
{ "settings": { "locale": "fr" } }
```

The backend stores this in `User.locale`. Flutter still controls its own UI locale, but should sync the customer preference so future notification and email language choices can use it.

## Deferred Settings

Phone changes remain protected by the verified phone/onboarding flow. `PATCH /customer/profile` rejects phone updates with `PHONE_VERIFICATION_REQUIRED`.

Email change is deferred. It should require a separate secure verification flow before being exposed to mobile.
