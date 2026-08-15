# Phase 2 Migration Notes

Prepared migration:

```text
prisma/migrations/20260813120000_mobile_auth_foundation/migration.sql
```

This migration is additive.

It adds:

- `User.disabledAt`
- `MobileSession`
- `Driver.userId`
- Unique index preventing duplicate driver-account linkage

It does not drop or rewrite existing data.

## Safety Verification

- Existing users remain valid because `User.disabledAt` is nullable and defaults to `NULL`, which means active.
- Existing Auth.js web sessions remain compatible because the `Session` and `Account` tables are unchanged.
- Existing `Driver` records remain valid because `Driver.userId` is nullable.
- Unique driver/user linkage cannot break existing data because all existing `Driver.userId` values start as `NULL`; PostgreSQL allows multiple `NULL` values in a unique index.
- `MobileSession` is a new table and does not affect existing Auth.js sessions.
- `disabledAt` fails open for existing active users and only blocks accounts when deliberately set.

## Staging Command

Run this only against the staging database when ready:

```bash
npx prisma migrate deploy
```

Use staging environment variables only. Do not paste or print credentials in terminals or commit logs.

Before production use:

1. Apply to staging first.
2. Link operational `Driver` records to authenticated `User` accounts.
3. Verify driver login against staging.
4. Verify existing web Auth.js login still works.
5. Apply with the normal deployment/migration process only after approval.

Do not allow driver mobile access until the migration is applied and driver records are linked.
