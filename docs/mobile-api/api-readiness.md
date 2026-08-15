# Current API Readiness Inventory

Classification meanings:

- `WEB ONLY`: Browser/session/page support only.
- `ADMIN ONLY`: Backoffice/admin role route only.
- `MOBILE READY`: Safe to consume as-is from mobile.
- `MOBILE ADAPTABLE`: Useful backend logic exists, but needs `/api/mobile/v1` contract work.
- `MOBILE MISSING`: Required mobile capability does not exist yet.

| Route | Classification | Reason |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | WEB ONLY | Auth.js browser/session contract. |
| `/api/auth/register` | MOBILE ADAPTABLE | Registration logic exists; mobile token issuance/error contract missing. |
| `/api/profile` | MOBILE ADAPTABLE | Customer session logic exists; token auth and DTO needed. |
| `/api/bookings` | MOBILE ADAPTABLE | Strong booking logic; needs mobile DTO, idempotency, token auth, stable errors. |
| `/api/bookings/[id]` | MOBILE ADAPTABLE | Own booking logic; needs mobile auth/DTO/errors. |
| `/api/payments` | MOBILE ADAPTABLE | Own payment listing; needs pagination and DTO. |
| `/api/payments/initiate` | MOBILE ADAPTABLE | Provider handoff exists; mobile-safe provider payload needed. |
| `/api/payments/verify` | MOBILE ADAPTABLE | Settlement logic reusable; mobile error shape needed. |
| `/api/payments/webhook` | SYSTEM/WEBHOOK | Provider-only. |
| `/api/coupons/validate` | MOBILE ADAPTABLE | Needs mobile quote/coupon contract. |
| `/api/vehicles` | MOBILE ADAPTABLE | Public catalog exists; stable DTO needed. |
| `/api/tours` | MOBILE ADAPTABLE | Public catalog exists; stable DTO/pagination needed. |
| `/api/route-prices` | MOBILE ADAPTABLE | Internal pricing shape; should be replaced by mobile quote endpoint. |
| `/api/fleet-vehicles` | MOBILE ADAPTABLE | Availability logic useful; expose only mobile-safe fleet details. |
| `/api/media/*` | MOBILE READY | Public media proxy is suitable if caching remains stable. |
| `/api/admin/*` | ADMIN ONLY | Requires admin roles and exposes backoffice operations. |
| `/api/mobile/v1/auth/*` | MOBILE READY | Phase 2 token auth foundation. |
| `/api/mobile/v1/customer/profile` | MOBILE READY | Token-authenticated DTO endpoint. |
| `/api/mobile/v1/customer/bookings*` | MOBILE ADAPTABLE | Implemented DTO endpoints; creation still adapts web route pending service extraction. |
| `/api/mobile/v1/driver/profile` | MOBILE READY | Token-authenticated linked driver profile. |
| `/api/mobile/v1/driver/trips*` | MOBILE READY | Assigned-driver-only trip reads and minimal actions. |
| Live GPS/tracking | MOBILE MISSING | No driver location model/API/realtime layer exists. |
| Push notifications | MOBILE MISSING | No mobile push token/provider model exists. |
| Chat | MOBILE MISSING | No message/conversation domain exists. |
