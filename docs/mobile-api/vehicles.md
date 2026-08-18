# Vehicles Contract

Vehicle discovery is category based and backed by Prisma `Vehicle` records managed in the backoffice.

Implemented endpoint:

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `GET /api/mobile/v1/vehicles` | Public | Returns active vehicle categories for customer booking UI. |

Fleet units are not returned by this endpoint. Use `POST /api/mobile/v1/availability` to discover customer-safe available units for a chosen category and date.

Fleet unit plate numbers, internal notes, maintenance notes, and admin-only fields are not exposed pre-booking.
