# Fleet Contract

`Vehicle` represents a bookable category such as Saloon, Sienna, RAV4, Prado, or Sprinter.

`FleetVehicle` represents a physical fleet unit with plate number, color, status, and category.

Mobile-safe fleet data may include:

- Category id/name/capacity/image
- Fleet unit id/label/color when relevant
- Plate number only where operationally appropriate
- Availability summary

Mobile clients must not receive:

- Internal admin notes
- Full maintenance history unless explicitly designed
- Pricing internals beyond customer-facing totals

Fleet assignment remains admin/backend-controlled. Driver apps may see the fleet unit assigned to their own trip.
