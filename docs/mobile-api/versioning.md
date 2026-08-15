# Mobile API Versioning

Use `/api/mobile/v1/...` for the first mobile contract.

Rules:

- Do not move existing web/admin APIs.
- Do not expose raw Prisma models.
- Add new fields in a backward-compatible way.
- Do not remove or rename response fields inside a released version.
- Breaking changes require `/api/mobile/v2/...`.
- Flutter apps must configure API base URLs per environment.

Recommended base URLs:

- Local: `http://localhost:3000/api/mobile/v1`
- Staging: `https://staging.beninfy.com/api/mobile/v1`
- Production: `https://www.beninfy.com/api/mobile/v1`

Every mobile response should be JSON and use the shared error contract in `errors.md`.
