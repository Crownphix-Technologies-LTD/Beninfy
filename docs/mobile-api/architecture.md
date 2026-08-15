# Mobile Backend Architecture

The Beninfy platform repository remains the canonical backend and operations system.

It owns:

- Authentication and authorization
- Booking creation and lifecycle rules
- Pricing and route calculations
- Vehicle and fleet availability
- Driver assignment
- Payment initiation and settlement
- Storage integrations
- Admin operations
- Audit logging

The Flutter apps consume stable mobile DTOs and never consume Prisma objects directly.

## Contract Boundary

Mobile apps may request:

- Customer profile and own bookings
- Available public catalog data
- Mobile-safe payment initiation data
- Driver profile and assigned trip data
- Driver status transitions after server validation
- Trip tracking data after authorization

Mobile apps must not request:

- Admin audit logs
- Internal notes
- Payment provider raw payloads
- Secret keys
- Prisma relation-heavy objects
- Arbitrary user, driver, fleet, or booking IDs without server-side ownership checks
