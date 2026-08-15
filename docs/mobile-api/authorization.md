# Mobile Authorization Matrix

Principals:

- `PUBLIC`
- `CUSTOMER`
- `DRIVER`
- `ADMIN`
- `SUPER_ADMIN`
- `SYSTEM_WEBHOOK`

| Operation | PUBLIC | CUSTOMER | DRIVER | ADMIN | SUPER_ADMIN | SYSTEM_WEBHOOK |
| --- | --- | --- | --- | --- | --- | --- |
| Read public catalog | Yes | Yes | Yes | Yes | Yes | No |
| Register customer | Yes, implemented | No | No | No | No | No |
| Customer login | Yes, implemented | No | No | No | No | No |
| Driver login | Yes, implemented | No | No | No | No | No |
| Read own profile | No | Own only | Own only | No mobile route | No mobile route | No |
| Create booking | Optional guest/customer | Own only | No | No | No | No |
| Read booking detail | No | Own only | Assigned leg context only | Admin route only | Admin route only | No |
| Initiate payment | No | Own booking or verified guest email | No | No | No | No |
| Settle payment | No | No | No | No | No | Yes |
| Apply coupon | Controlled public/customer | Own checkout | No | No | No | No |
| Driver assigned trips | No | No | Own assignments only, implemented | Admin route only | Admin route only | No |
| Driver trip action | No | No | Own assigned leg only, implemented | Admin route only | Admin route only | No |
| Fleet assignment | No | No | No | Authorized admin | Yes | No |
| Pricing modification | No | No | No | Pricing/admin role | Yes | No |
| Create admin user | No | No | No | No | Yes | No |

Mobile endpoints must derive customer and driver identity from the authenticated principal. They must not trust arbitrary `userId` or `driverId` values supplied by clients.
