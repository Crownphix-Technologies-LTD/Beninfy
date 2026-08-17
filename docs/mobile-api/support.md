# Support Configuration

Implemented endpoint:

- `GET /api/mobile/v1/config/support`

This endpoint is public and returns customer-safe support contact configuration.

Environment variables:

- `SUPPORT_EMAIL`
- `SUPPORT_PHONE`
- `SUPPORT_WHATSAPP`

If `SUPPORT_WHATSAPP` is not configured, WhatsApp is returned as `null`. The mobile backend does not hardcode the website support widget number as an authoritative mobile contract.
