# Flutter Development Configuration

Future Flutter repositories:

- `beninfy-customer`
- `beninfy-driver`

Both apps must consume the platform API through environment-specific base URLs.

## Environments

Development:

```text
http://localhost:3000/api/mobile/v1
```

Staging:

```text
https://STAGING_DOMAIN/api/mobile/v1
```

Production:

```text
https://www.beninfy.com/api/mobile/v1
```

Do not hardcode production URLs into development builds.

## Recommended Flutter Configuration

Use compile-time configuration:

```bash
flutter run --dart-define=APP_ENV=development --dart-define=API_BASE_URL=http://localhost:3000/api/mobile/v1
flutter run --dart-define=APP_ENV=staging --dart-define=API_BASE_URL=https://STAGING_DOMAIN/api/mobile/v1
flutter build appbundle --dart-define=APP_ENV=production --dart-define=API_BASE_URL=https://www.beninfy.com/api/mobile/v1
```

Keep provider secrets, database URLs, SMTP credentials, Supabase service-role keys, and deployment credentials out of Flutter builds.

## Authentication Flow

Login:

```text
Flutter -> POST /auth/login -> accessToken + refreshToken
```

Authenticated request:

```text
Authorization: Bearer <accessToken>
```

Token expired:

```text
POST /auth/refresh -> rotated accessToken + refreshToken -> retry original request once
```

Logout:

```text
POST /auth/logout -> delete local credentials
```

Store refresh tokens using platform secure storage. Access tokens may be kept in memory and refreshed when needed.
