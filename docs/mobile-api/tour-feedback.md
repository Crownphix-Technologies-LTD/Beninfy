# Private post-Tour service feedback

Private Customer service-quality/compliance reports, not public Driver ratings. Reports are never exposed to Driver mobile. Flags mean Operations review required, not adjudicated findings; no submission changes Driver duty, earnings or accounts.

## Eligibility and attribution

Only the owning Customer may submit for a `completed` TourBooking with `paymentStatus: paid`. One submission per booking. Other Customers receive `TOUR_BOOKING_NOT_FOUND` to avoid ownership disclosure. Completed Days are grouped by assigned Driver: one Driver across three Days has one target with three Days; different Drivers have separate targets. Unassigned historical Days cannot be attributed to a fabricated Driver; those bookings may accept overall feedback with zero Driver targets. Cancelled/unexecuted Days are excluded.

The server issues booking-specific opaque `targetId` values. Flutter echoes them; it never constructs Driver IDs/Day attribution. Submission must contain exactly one complete set of answers for every issued target. Server re-derives assignments under a booking lock; foreign, missing and duplicate targets are rejected.

## GET

`GET /api/mobile/v1/customer/tour-bookings/:tourBookingId/feedback`

Customer bearer authentication and completed onboarding required. Limit: 60 reads per Customer per 15 minutes. HTTP 200:

```json
{
  "feedback": {
    "eligible": true,
    "submitted": false,
    "reason": "eligible",
    "context": {
      "tourBookingId": "booking-id",
      "reference": "BFYT-REFERENCE",
      "tourTitle": "Cotonou City Tour",
      "selectedTourIds": ["cotonou-city-tour"],
      "startDate": "2030-01-01T00:00:00.000Z",
      "endDate": "2030-01-01T00:00:00.000Z"
    },
    "drivers": [
      {
        "targetId": "0123456789abcdef0123456789abcdef",
        "displayName": "Driver display name",
        "days": [
          {
            "tourBookingDayId": "day-id",
            "dayNumber": 1,
            "scheduledDate": "2030-01-01T00:00:00.000Z",
            "sourceTourId": "cotonou-city-tour",
            "tourTitle": "Cotonou City Tour"
          }
        ]
      }
    ],
    "submission": null
  }
}
```

`reason`: `eligible`, `not_completed`, `already_submitted`. If submitted or incomplete, `eligible` is false and `drivers` is empty. Submitted GET returns the immutable `submission` shape below. `sourceTourId` may be null for historical snapshots. Context is returned for any owned booking.

## POST

`POST /api/mobile/v1/customer/tour-bookings/:tourBookingId/feedback`

Customer bearer authentication and completed onboarding required. Limit: 10 attempts per Customer per 15 minutes. Exact request:

```json
{
  "overallRating": 5,
  "comment": "Optional overall comment",
  "drivers": [
    {
      "targetId": "0123456789abcdef0123456789abcdef",
      "professionalRespectful": true,
      "feltSafe": true,
      "followedAgreedService": "yes",
      "uncomfortablePersonalQuestions": false,
      "offPlatformSolicitation": false,
      "unauthorizedPaymentRequest": false,
      "comment": "Optional Driver-specific comment"
    }
  ]
}
```

Rating: integer 1-5. Overall comment: optional trimmed string, max 2000 characters. Driver comment: optional trimmed string, max 1000. Empty comments persist/return null. All six structured answers are required JSON booleans except `followedAgreedService`: `yes`, `no`, `not_applicable`. Target IDs are the 32-character values from GET. Maximum 30 targets. Extra fields (Driver/customer/Day IDs, risk flags, timestamps, ownership state) are rejected.

HTTP 201:

```json
{
  "submission": {
    "id": "feedback-id",
    "overallRating": 5,
    "comment": "Optional overall comment",
    "submittedAt": "2030-01-02T10:00:00.000Z",
    "drivers": [
      {
        "displayName": "Driver display name",
        "answers": {
          "professionalRespectful": true,
          "feltSafe": true,
          "followedAgreedService": "yes",
          "uncomfortablePersonalQuestions": false,
          "offPlatformSolicitation": false,
          "unauthorizedPaymentRequest": false,
          "comment": "Optional Driver-specific comment"
        },
        "days": [
          {
            "tourBookingDayId": "day-id",
            "dayNumber": 1,
            "scheduledDate": "2030-01-01T00:00:00.000Z",
            "sourceTourId": "cotonou-city-tour",
            "tourTitle": "Cotonou City Tour"
          }
        ]
      }
    ]
  }
}
```

Both responses use `Cache-Control: private, no-store`. No tokens, credentials, Customer identity, or private risk flags appear in Customer responses. Concurrent valid submissions create one report: one 201 and one 409. No Customer edit/delete endpoint in V1. After a lost success, GET `submitted: true` means stop prompting.

## Errors

Envelope: `{ "error": { "code": "...", "message": "..." } }`; rate limits include `error.details.retryAfter`.

| HTTP | Code                              | Meaning                                |
| ---- | --------------------------------- | -------------------------------------- |
| 400  | VALIDATION_ERROR                  | Invalid schema/rating/comment/answer   |
| 400  | TOUR_FEEDBACK_TARGET_INVALID      | Foreign, missing or duplicate target   |
| 401  | UNAUTHENTICATED                   | Missing/invalid session                |
| 403  | FORBIDDEN / ONBOARDING_INCOMPLETE | Wrong audience / incomplete onboarding |
| 404  | TOUR_BOOKING_NOT_FOUND            | Missing or unowned booking             |
| 409  | TOUR_FEEDBACK_NOT_ALLOWED         | Not completed and paid                 |
| 409  | TOUR_FEEDBACK_ALREADY_SUBMITTED   | Valid duplicate; original unchanged    |
| 429  | RATE_LIMITED                      | Request limit exceeded                 |

## Private flags and Backoffice

Flags are derived and persisted per Driver and aggregated on the report:

- `safety_concern`: did not feel safe.
- `off_platform_solicitation`: reported direct booking/contact/payment outside Beninfy.
- `unauthorized_payment_request`: reported extra unauthorized payment request.
- `professionalism_concern`: not professional/respectful, or uncomfortable personal questioning.
- `service_itinerary_concern`: did not follow agreed service; N/A does not flag.

Positive answers produce no flags. A low rating alone does not accuse a Driver.

Backoffice **Tour feedback** uses `GET /api/admin/tour-feedback?page=1&pageSize=20&flagged=true`. Page size: 1-50; page: 1-10000. Omit `flagged` for all, `true` for any flag, `false` for none. Response: `{ feedback: [...], pagination: { page, pageSize, total, totalPages } }`. Rows include persisted report/Driver/Day records, `reviewRequired`, current Customer name/email/anonymizedAt, and booking reference/title/selected Tours/dates. Full structured answers/comments are included without N+1 detail fetches. Page/API require `tour_feedback` permission: admin, super_admin, operations_admin only. Content/finance/support/fleet admins, Customers and Drivers have no access. Invalid filters: 400; unauthorized: 403. Private/no-store responses. Labels describe reports pending Operations review.

## Models and retention

- `TourFeedback`: unique booking/customer reference, overall rating/comment, aggregate flags, submitted timestamp.
- `TourDriverFeedback`: one distinct Driver per submission, immutable Driver display name, structured answers/comment and flags.
- `TourFeedbackDay`: normalized Day reference plus source Tour identity/title, day number and date snapshots.

FKs RESTRICT blind deletion of compliance evidence. Later Driver name/Day changes do not rewrite attribution. No Customer name/email snapshot is stored. The existing staged deletion worker tombstones the User and revokes sessions without deleting these reports. Backoffice resolves current tombstoned identity and hides synthetic email. Bounded report text remains private operational/dispute evidence; manual retention/redaction must account for personal information Customers may put in comments. No arbitrary retention timeout is introduced.

Additive migration: `20260918150000_tour_service_feedback`. DB constraints enforce rating, comment lengths, service-answer enum, one submission, unique Driver per report and Day attribution FKs. Tests execute actual mobile handlers and the staged anonymization worker against disposable PostgreSQL.
