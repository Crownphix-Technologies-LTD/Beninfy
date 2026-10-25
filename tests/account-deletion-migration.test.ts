import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

const url = process.env.WEB_DELETION_TEST_DATABASE_URL
test('cleanup migration is additive, private and enforces durable outbox constraints', { skip: !url }, async () => {
  const target = new URL(url!)
  assert.equal(target.hostname, '127.0.0.1')
  assert.match(target.pathname, /^\/beninfy_dispatch_test/)
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    await db.query('BEGIN')
    const schema = 'migration_' + randomUUID().replaceAll('-', '')
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.query(`SET LOCAL search_path TO "${schema}"`)
    await db.query(`CREATE TABLE "User" (id text PRIMARY KEY);
      CREATE TABLE "Booking" (id text PRIMARY KEY, status text);
      CREATE TABLE "Payment" (id text PRIMARY KEY, amount integer, status text);
      INSERT INTO "User" VALUES ('fixture');
      INSERT INTO "Booking" VALUES ('fixture', 'confirmed');
      INSERT INTO "Payment" VALUES ('fixture', 10000, 'paid')`)
    const snapshot = async () => (await db.query(`SELECT
      (SELECT jsonb_agg(t) FROM "User" t) AS users,
      (SELECT jsonb_agg(t) FROM "Booking" t) AS bookings,
      (SELECT jsonb_agg(t) FROM "Payment" t) AS payments`)).rows
    const before = await snapshot()
    await db.query(readFileSync('prisma/migrations/20261025120000_account_deletion_cleanup/migration.sql', 'utf8'))
    assert.deepEqual(await snapshot(), before)
    const metadata = (await db.query(`SELECT relrowsecurity,
      NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(relacl, acldefault('r', relowner))) WHERE grantee = 0) AS private
      FROM pg_class WHERE oid = '"AccountDeletionCleanup"'::regclass`)).rows[0]
    assert.equal(metadata.relrowsecurity, true)
    assert.equal(metadata.private, true)
    const indexes = (await db.query(`SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = 'AccountDeletionCleanup'`, [schema])).rows.map(r => r.indexdef).join('\n')
    assert.match(indexes, /UNIQUE.*\("userId"\)/)
    assert.match(indexes, /\(status, "nextAttemptAt"\)/)
    await db.query(`INSERT INTO "AccountDeletionCleanup" (id,"userId","avatarUrl","updatedAt") VALUES ('job','fixture','synthetic-avatar',now())`)
    async function rejects(sql: string, code: string) {
      await db.query('SAVEPOINT invalid_change')
      await assert.rejects(db.query(sql), (error: unknown) => (error as {code?: string}).code === code)
      await db.query('ROLLBACK TO SAVEPOINT invalid_change')
    }
    await rejects(`DELETE FROM "User" WHERE id='fixture'`, '23503')
    await rejects(`INSERT INTO "AccountDeletionCleanup" (id,"userId","avatarUrl","updatedAt") VALUES ('duplicate','fixture','synthetic-avatar',now())`, '23505')
    await rejects(`UPDATE "AccountDeletionCleanup" SET attempts=9`, '23514')
    await rejects(`UPDATE "AccountDeletionCleanup" SET status='discarded'`, '23514')
    await rejects(`UPDATE "AccountDeletionCleanup" SET status='succeeded'`, '23514')
    await db.query(`UPDATE "AccountDeletionCleanup" SET status='blocked',attempts=8`)
    assert.equal((await db.query(`SELECT "avatarUrl" FROM "AccountDeletionCleanup"`)).rows[0].avatarUrl, 'synthetic-avatar')
    await db.query(`UPDATE "AccountDeletionCleanup" SET status='succeeded',"avatarUrl"=NULL,"completedAt"=now()`)
    assert.deepEqual(await snapshot(), before)
  } finally {
    await db.query('ROLLBACK')
    await db.end()
  }
})
