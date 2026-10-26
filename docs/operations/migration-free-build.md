# Migration-free Vercel builds

`npm run build` generates Prisma Client and compiles Next.js. It does not apply migrations. `npm run db:migrate` remains a separate, explicitly authorized operational step. No migration files or schema changes are part of this fix.

Vercel must use the repository-root `vercel.json` and its `npm run build` command. Do not rely on an external `--local-config` file to replace the uploaded repository configuration. Verify the remote build log contains `prisma generate && next build` and no migration command before promotion.

Production runtime uses the verified Supabase shared transaction pooler, port 6543. The separately controlled Prisma migration connection uses the session pooler, port 5432. Runtime `DATABASE_URL` uses `sslmode=verify-full` and `sslrootcert=certs/supabase-ca.crt`. Migration `DIRECT_URL` uses `sslmode=require`, `sslaccept=strict`, and `sslcert=certs/supabase-ca.crt`. Never use the transaction pooler to apply migrations.

`certs/supabase-ca.crt` is a public trust anchor, not a credential. Next.js includes it in server-function traces. Validate its presence in `.next/server/app/api/mobile/v1/tours/route.js.nft.json` and the deployed function before promotion. Its SHA-256 is `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`; expiry is 26 April 2031. Update it through review before expiry or a provider CA change.

Database environment changes only take effect on new deployments. Old deployments retain their old database password; an instant rollback alone cannot repair a rotated password. Preserve a known-good deployment built with current credentials for rollback.

The payment cron remains `0 3 * * *`. The existing external push schedule is unchanged. No deletion cron or purge schedule is enabled by this change.
