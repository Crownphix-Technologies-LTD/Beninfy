# Saved travellers

All routes require an authenticated Customer with completed onboarding. The
server derives ownership from the access token. Request objects are strict and
reject `customerId`, `userId`, or any other field outside the documented contract.

## List

`GET /api/mobile/v1/customer/saved-travellers`

```json
{ "savedTravellers": [] }
```

## Create

`POST /api/mobile/v1/customer/saved-travellers`

```json
{
  "fullName": "Ada Example",
  "phone": "+2290102030405",
  "email": "ada@example.com",
  "label": "Colleague"
}
```

Returns HTTP 201 with `{ "savedTraveller": SavedTraveller }`.

## Update

`PATCH /api/mobile/v1/customer/saved-travellers/:savedTravellerId`

Send at least one create field. Returns `{ "savedTraveller": SavedTraveller }`.

## Delete

`DELETE /api/mobile/v1/customer/saved-travellers/:savedTravellerId`

Returns `{ "deleted": true }`. Repeated deletion returns
`SAVED_TRAVELLER_NOT_FOUND` with HTTP 404. Deletion never changes historical
bookings because booking passenger data is stored as a snapshot.

## DTO

```json
{
  "id": "opaque-id",
  "fullName": "Ada Example",
  "phone": "+2290102030405",
  "email": "ada@example.com",
  "label": "Colleague",
  "createdAt": "2026-09-30T12:00:00.000Z",
  "updatedAt": "2026-09-30T12:00:00.000Z"
}
```

Phone accepts E.164 international input, `00` international prefixes, and the
existing Nigerian local mobile convention. Stored phone values are normalized
to E.164. Email and label are nullable.

## Booking integration

Ride creation already accepts `passengerName`, `passengerPhone`, and the
`travelers` manifest. Flutter copies selected Saved Traveller values into those
snapshot fields; it must not submit the saved-traveller ID as booking authority.
Editing or deleting the reusable profile therefore cannot rewrite Ride history.

Tour booking currently accepts traveller count only. Named Tour traveller
snapshots are not part of the frozen Tour contract, so Saved Traveller selection
must not be offered for Tour manifests until that contract is separately approved.

## Errors

- `UNAUTHENTICATED` (401)
- `ONBOARDING_INCOMPLETE` (403)
- `VALIDATION_ERROR` (400)
- `PHONE_INVALID` (400)
- `SAVED_TRAVELLER_NOT_FOUND` (404)
