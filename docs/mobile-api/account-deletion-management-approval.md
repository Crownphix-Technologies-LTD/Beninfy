# Beninfy account-deletion management approval record

Organization: Crownphix Technologies Ltd. Product: Beninfy Customer.
Provisional adoption date: **25 October 2026**.
Source: management's supplied approval record and subsequent instruction to adopt
the existing nine schedules provisionally. This records that instruction; it does
not assert an additional signature, legal opinion or financial sign-off.

## Decision register

| Decision | Status |
| --- | --- |
| 30-day account-deletion grace | APPROVED; unchanged |
| Nine existing retention schedules | PROVISIONALLY ADOPTED as internal operational targets for policy planning |
| Financial-ledger duration | TBD pending legal/finance review |
| Verified statutory retention requirements | NOT ESTABLISHED by this record |
| Legal/privacy and financial verification | PENDING |
| Application/purge implementation | PLAN ONLY; not implemented by this approval |
| Production deployment or migration | NOT AUTHORIZED |
| Deletion cron or automated purge activation | NOT AUTHORIZED |
| Real account deletion/anonymization | NOT AUTHORIZED |
| Public deletion-page or revised policy publication | NOT AUTHORIZED |
| Google Play deletion-URL submission | NOT AUTHORIZED |

## Approved lifecycle

Customers may request deletion through the mobile application or public website.
Ownership must be verified before confirmation. Immediately after verified
confirmation, account access is disabled and sessions/registrations are revoked.
The account becomes eligible for anonymization after **30 days**. An authorized
administrator may restore a pending account **before anonymization only**, subject
to existing controls. No self-service restoration or completion within 30 days is
promised. Actual processing depends on separately authorized worker operations.

## Provisional retention decision

Management adopts all nine existing schedules, including their existing conditions
and exceptions, exactly as reproduced in the first table of
[the retention matrix](./account-deletion-retention-approval.md). No new period is
introduced. This supersedes the earlier decision to leave those schedules merely
unadopted proposals; it does **not** supersede the production hold or pending
legal/financial verification. The financial-ledger period remains TBD.

Provisional adoption is a planning decision, not evidence that every retained field
is necessary or that any period is required by law. Legal/finance must verify the
actual entity/jurisdictions, accounting and provider obligations, claims windows,
minimum evidence, exceptions, holds and processor/backup limits. Ambiguous expiry
triggers and existing-record scope require decisions before implementation.

## Operational responsibility

| Responsibility | Assignment / remaining condition |
| --- | --- |
| Primary technical responder | Idowu James |
| Backup technical responder | CTO; actual officeholder and availability must be confirmed |
| Alert destination | info@crownphix.tech; delivery and escalation tests pending |
| Privacy/legal approval | Pending assignment and approval |
| Financial retention approval | Pending assignment and approval |

The proposed Supabase schedule remains `*/5 * * * *` for authenticated POST
`/api/workers/accounts/anonymize`. Production configuration, eligible backlog,
authentication, successful/failed-run monitoring, alert delivery, escalation and
database/avatar recovery still require verification and separate authorization.
Existing payment and push schedules must remain unchanged.

## Frozen engineering evidence

Branch: `release/account-deletion-rc-20261025`.
Commit: `8f870542a3f057763d008fac233a238fe52d1876`.
Reported validation: 409/409 tests, PostgreSQL concurrency, TypeScript, ESLint,
Prisma and production build passed (three existing lint warnings recorded).
That RC does **not** implement the nine retention schedules and remains unchanged.
This planning documentation was prepared outside the frozen RC and is carried
forward separately on the production reconciliation branch.

Next review artifacts: [implementation plan](./account-deletion-retention-implementation-plan.md)
and [EN/FR disclosure revisions](./account-deletion-retention-disclosures-review.md).
No production operation or publication follows automatically from this record.
