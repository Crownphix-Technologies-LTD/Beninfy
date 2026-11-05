import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import {
  DATABASE_POOL_DEFAULT_MAX,
  DATABASE_POOL_HARD_MAX,
  databasePoolConfig,
} from '../src/lib/databasePool'

test('runtime pool is bounded and DATABASE_URL remains authoritative', () => {
  const local = databasePoolConfig('postgresql://user:pass@127.0.0.1:5432/app')
  assert.equal(local.max, DATABASE_POOL_DEFAULT_MAX)
  assert.equal(local.ssl, false)
  assert.equal(local.connectionString, 'postgresql://user:pass@127.0.0.1:5432/app')

  assert.equal(
    databasePoolConfig('postgresql://user:pass@localhost/app', { poolMax: '1' }).max,
    1
  )
  assert.equal(
    databasePoolConfig('postgresql://user:pass@localhost/app', { poolMax: '500' }).max,
    DATABASE_POOL_HARD_MAX
  )
  assert.equal(
    databasePoolConfig('postgresql://user:pass@localhost/app', { poolMax: 'invalid' }).max,
    DATABASE_POOL_DEFAULT_MAX
  )
  assert.throws(() => databasePoolConfig(''), /DATABASE_URL is required/)
})

test('remote pool enforces verified TLS with the bundled Supabase CA', () => {
  const config = databasePoolConfig(
    'postgresql://user:pass@pooler.example.test:6543/postgres?pgbouncer=true&sslmode=require'
  )
  assert.equal(config.max, DATABASE_POOL_DEFAULT_MAX)
  assert.match(String(config.connectionString), /pgbouncer=true/)
  assert.doesNotMatch(String(config.connectionString), /sslmode=/)
  assert.equal(config.ssl && typeof config.ssl === 'object' && config.ssl.rejectUnauthorized, true)
  assert.equal(
    config.ssl && typeof config.ssl === 'object' && config.ssl.servername,
    'pooler.example.test'
  )
  assert.match(
    String(config.ssl && typeof config.ssl === 'object' && config.ssl.ca),
    /BEGIN CERTIFICATE/
  )
})

test('Prisma uses the external bounded pool without weakening TLS', () => {
  const source = readFileSync('src/lib/prisma.ts', 'utf8')
  const config = readFileSync('src/lib/databasePool.ts', 'utf8')
  const nextConfig = readFileSync('next.config.ts', 'utf8')
  assert.match(source, /new Pool\(databasePoolConfig\(\)\)/)
  assert.match(source, /new PrismaPg\(pool\)/)
  assert.doesNotMatch(source + config, /rejectUnauthorized:\s*false/)
  assert.doesNotMatch(source, /DIRECT_URL/)
  assert.match(nextConfig, /outputFileTracingIncludes/)
  assert.match(nextConfig, /\.\/certs\/supabase-ca\.crt/)
})

test(
  'PrismaPg respects the pool bound and pins interactive transactions to one session',
  { skip: !process.env.DRIVER_SEARCH_TEST_DATABASE_URL },
  async () => {
    const pool = new Pool(
      databasePoolConfig(process.env.DRIVER_SEARCH_TEST_DATABASE_URL, { poolMax: '3' })
    )
    const client = new PrismaClient({ adapter: new PrismaPg(pool) })

    try {
      await Promise.all(
        Array.from({ length: 12 }, () =>
          client.$queryRawUnsafe('SELECT 1::int AS result FROM pg_sleep(0.05)')
        )
      )
      assert.ok(pool.totalCount <= 3, `pool opened ${pool.totalCount} connections`)

      const sessionIds = await client.$transaction(async (transaction) => {
        const first = await transaction.$queryRawUnsafe<Array<{ pid: number }>>(
          'SELECT pg_backend_pid()::int AS pid'
        )
        const second = await transaction.$queryRawUnsafe<Array<{ pid: number }>>(
          'SELECT pg_backend_pid()::int AS pid'
        )
        return [first[0]?.pid, second[0]?.pid]
      })

      assert.ok(sessionIds[0])
      assert.equal(sessionIds[0], sessionIds[1])
    } finally {
      await client.$disconnect()
      await pool.end()
    }
  }
)
