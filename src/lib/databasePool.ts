import { readFileSync } from 'node:fs'
import type { PoolConfig } from 'pg'

const DEFAULT_POOL_MAX = 3
const MAX_POOL_MAX = 10

function boundedPoolMax(value: string | undefined) {
  if (!value) return DEFAULT_POOL_MAX
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_POOL_MAX
  return Math.min(parsed, MAX_POOL_MAX)
}

function isLocalDatabase(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function connectionStringWithoutSslOverrides(connectionString: string) {
  const url = new URL(connectionString)
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) {
    url.searchParams.delete(key)
  }
  return url.toString()
}

export function databasePoolConfig(
  connectionString = process.env.DATABASE_URL,
  options: { poolMax?: string } = {}
): PoolConfig {
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const url = new URL(connectionString)
  const local = isLocalDatabase(url.hostname)

  return {
    connectionString: local
      ? connectionString
      : connectionStringWithoutSslOverrides(connectionString),
    max: boundedPoolMax(options.poolMax ?? process.env.DATABASE_POOL_MAX),
    min: 0,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    maxLifetimeSeconds: 300,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    application_name: 'beninfy-web',
    ssl: local
      ? false
      : {
          ca: readFileSync('./certs/supabase-ca.crt', 'utf8'),
          rejectUnauthorized: true,
          servername: url.hostname,
        },
  }
}

export const DATABASE_POOL_DEFAULT_MAX = DEFAULT_POOL_MAX
export const DATABASE_POOL_HARD_MAX = MAX_POOL_MAX
