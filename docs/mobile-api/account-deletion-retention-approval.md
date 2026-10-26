# Retention approval matrix — draft, 2026-10-25

**NOT APPROVED. No retention/purge rule in this document is deployed or enabled.**
These are proposed operational limits, not statutory requirements. The existing
system retains these records without fixed purge deadlines. Legal counsel must
identify Beninfy's operating entity, applicable jurisdictions, tax/accounting,
transport, claims and provider obligations before approving dates. A legal hold
requires a recorded reason, owner, scope and review date; it is not a blanket
exception for all Customer data.

| Category | Purpose and minimum necessary data | Existing obligation / evidence | Proposed period or decision | Approval required | Proposed purge/anonymization mechanism |
| --- | --- | --- | --- | --- | --- |
| Booking/passenger/travel/location | Fulfil journey and handle complaints. Minimum booking reference, itinerary/date, service status and amounts; contact, passport and precise location only while justified | Operational relations exist; no verified statutory period in current policy | Redact passenger/contact/document/precise-location data 30 days after trip completion/cancellation, unless an approved active case/hold needs named fields. Preserve only the approved ledger linkage | Operations + privacy/legal must validate cross-border and claims requirements | Scheduled field redaction across Ride/Tour snapshots and location/history tables; keep totals without identity where feasible |
| Payment/reconciliation | Settle accounts, evidence financial transactions. Reference, amount, currency, date, provider and status; no unnecessary passenger/contact data or checkout access credentials | Accounting/provider obligations likely require review; no applicable Beninfy duration established | Ledger duration **TBD by finance/legal**, not guessed. Proposal: purge transient checkout credentials and non-ledger personal metadata 30 days after final reconciliation | Finance + legal; document jurisdiction, trigger, minimum statutory fields and exact duration | Archive minimal ledger with restricted access; purge provider checkout metadata and redundant PII; execute deletion only after approved holds expire |
| Refund/dispute/support case | Resolve case, substantiate decision. Case/reference, relevant evidence and decision; exclude unrelated travel/conversation data | Existing PaymentResolution workflow; claim limitation/chargeback obligations unverified | Operational proposal: 180 days after final case closure; counsel must replace/extend where justified and define legal-hold reviews | Support/finance + legal | Close-case expiry job; redact narratives and remove evidence attachments after approved deadline; retain minimal lawful financial evidence |
| Audit/consent/deletion | Accountability/security. Event, pseudonymous actor/entity ID, time, result; avoid email, token, code, password and unnecessary IP/content | Existing AuditLog and User consent timestamps; no approved retention schedule | Proposal: security diagnostics 90 days; minimal consent/deletion decision evidence 24 months after account anonymization, subject to counsel approval | Security/privacy + legal | Event-class retention job; redact legacy metadata/contact/IP; retain minimal proof under an approved access policy |
| Chat | Trip coordination and selected case evidence. Conversation text only while necessary | TripConversation/ChatMessage retained today; no approved post-trip period | Proposal: 30 days after trip closure; case-selected evidence follows approved case policy | Support/privacy + legal | Delete ordinary message bodies and sender links; isolate only required case evidence with a separate expiry |
| Notifications | Customer inbox, delivery diagnosis, Admin accountability. Minimal event type/time/status | Existing Notification/NotificationDelivery/Campaign; no fixed periods | Proposal: inbox/content 30 days after event; delivery diagnostics 14 days after terminal state; Admin audit follows audit policy | Product/security/privacy | Purge notification content/payload and device/provider links after expiry; retain anonymous delivery totals |
| Tour feedback | Quality/safety investigation. Ratings and required incident evidence; free text minimized | Private feedback and driver/day attribution retained today | Proposal: ordinary identified feedback 180 days after trip, then irreversible aggregates; safety incidents follow approved case policy | Operations/safety + legal | Redact comments and remove customer/day identifying linkage where safe; retain only non-identifying aggregates |
| Revoked sessions/devices | Prevent reuse, limited security troubleshooting. Minimal revoked identifier/hash and expiry | MobileSession/PushDevice remain stored after revocation; inactive FCM tokens are not needed to send | Proposal: erase raw inactive FCM tokens at anonymization; purge revoked device metadata after 30 days; keep refresh-token revocation evidence until original expiry + 7 days, unless security approves a shorter equivalent | Security + privacy/legal; confirm session/notification FK impacts | Separate expiry/revocation cleanup, schema-compatible token redaction; do not reactivate revoked registrations |
| Backups/external providers | Recovery and contracted processing; only necessary copies | Actual Supabase/SMTP/storage/payment-provider policies not verified | Proposal: backup recovery horizon no more than 35 days **if approved and supported by vendor plan**; provider deletion request within 7 days of processing and target completion within 30 days, with documented exceptions. Actual provider/ledger periods remain TBD | Infrastructure + vendor owners + legal | Vendor deletion requests, verified snapshot rotation, deletion replay before restoring service from a backup, completion evidence |

The 30-day account-deletion grace is a separate existing eligibility rule. It does
not approve any retained-data period above, nor imply a processing SLA. The public
page must continue describing actual behavior until approved rules are implemented
and tested. Backup and provider promises require contract/plan verification first.

Each approval must record: decision-maker, purpose/lawful basis, minimum fields,
start event, maximum period, holds/review interval, purge method, responsible
operator, monitoring and effective date. All nine rows currently require approval.

## Final management decision register — release gate

Every decision below is **PENDING**. Role labels are required approvers, not named
people who have signed off. No draft duration above is authorized for implementation
or publication. Management must record a named approver, dated decision and evidence
for each row; legal conclusions require counsel's review.

| Decision | Required approval | Evidence needed before release | Status |
| --- | --- | --- | --- |
| Applicable entity/jurisdictions and lawful purposes | Management + legal/privacy | Operating entity, countries served, controller/processors and documented legal obligations; distinguish law from operational preference | PENDING |
| Booking/passenger/location redaction | Operations + legal/privacy | Field inventory, completion/cancellation trigger, exact maximum period and case-specific exceptions | PENDING |
| Payment/reconciliation retention | Finance + legal | Applicable accounting/tax/provider obligations, minimum ledger fields, exact period/trigger, treatment of checkout secrets and reconciliation metadata | PENDING |
| Disputes/refunds/support evidence | Support + finance + legal | Chargeback/claims windows verified against actual contracts/law; closure trigger and evidence access | PENDING |
| Audit/consent/deletion evidence | Security + legal/privacy | Event classes, minimal pseudonymous evidence, separate diagnostic and accountability periods | PENDING |
| Chat and notifications | Product + support + security/privacy | Ordinary content expiry, narrowly selected case evidence, delivery diagnostics and Admin audit treatment | PENDING |
| Tour feedback and safety cases | Operations/safety + legal | Identified-feedback period, irreversible aggregate criteria and separately scoped incident evidence | PENDING |
| Revoked devices/sessions | Security + legal/privacy | Token erasure and FK-safe cleanup design; revocation evidence needed through actual credential expiry | PENDING |
| Backups and external providers | Infrastructure + vendor owners + legal | Actual Supabase/SMTP/storage/payment contracts and plans, backup lifetime, deletion/recovery procedures and processor confirmation | PENDING |
| Legal holds | Legal + operations | Authorized hold owner, reason, fields, scope, review interval, release event and audited expiry | PENDING |
| Public EN/FR disclosure and grace | Management + legal/privacy + product | Explicit approval of current 30-day eligibility rule, immediate access disablement, no self-service restoration, retained-data limitations and honest processing commitments | PENDING |
| Operational accountability | Management + backend/infrastructure | Named responder and backup, alert destination/coverage, backlog escalation and approved five-minute schedule | PENDING |

After approval: implement and test the selected purge/redaction rules, verify vendor
capabilities and holds, then reconcile EN/FR policy wording against actual behavior.
Approval alone does not make proposed rules operational. Public policy publication
and Production deployment remain separate authorization boundaries.
