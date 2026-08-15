# Mobile API CORS

Native Flutter iOS and Android HTTP clients are not browser-origin clients in the same way as web apps, so they do not require broad CORS relaxation.

Current recommendation:

- Do not weaken global CORS for native Flutter.
- Keep existing web security headers.
- If Flutter Web is introduced later, add a specific allowlist for the Flutter Web origin.
- Never allow wildcard origins on authenticated mobile endpoints.
- Continue using `Authorization: Bearer <access-token>` for mobile APIs.

Provider webhooks and payment callbacks remain separate server-to-server or browser redirect flows and should not influence mobile CORS policy.
