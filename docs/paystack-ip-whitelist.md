# Paystack IP Whitelist Setup

Paystack API IP whitelisting checks the outbound IP address of the server calling
Paystack with `PAYSTACK_SECRET_KEY`.

This app runs Paystack calls from Node.js route handlers:

- `/api/payments/initiate`
- `/api/payments/verify`
- `/{locale}/rides/confirmed`

Do not add Paystack's webhook IPs to the Paystack dashboard API whitelist. Those
IPs are for inbound webhooks from Paystack to Beninfy.

## Permanent Vercel Setup

1. Enable Vercel Static IPs for this project.
2. In Vercel, go to Project Settings -> Connectivity / Networking.
3. Enable Static IPs and choose the active function region(s).
4. Copy the assigned static IPv4 egress addresses.
5. In Paystack Dashboard -> API Keys & Webhooks -> IP Whitelisting, add those
   Vercel static IPv4 addresses for the matching test/live environment.
6. Keep `PAYSTACK_WEBHOOK_ALLOWED_IPS` set to Paystack's webhook source IPs:

```env
PAYSTACK_WEBHOOK_ALLOWED_IPS=52.31.139.75,52.49.173.169,52.214.14.220
```

## Important Distinction

- Paystack dashboard IP whitelist: Vercel -> Paystack API calls.
- `PAYSTACK_WEBHOOK_ALLOWED_IPS`: Paystack -> Beninfy webhook calls.
