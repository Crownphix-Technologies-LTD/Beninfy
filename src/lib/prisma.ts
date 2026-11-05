import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { databasePoolConfig } from '@/lib/databasePool'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaPool: Pool | undefined
}

function createPrisma() {
  const pool = new Pool(databasePoolConfig())
  pool.on('error', (error: NodeJS.ErrnoException) => {
    console.error('PostgreSQL pool error', { code: error.code ?? 'UNKNOWN' })
  })
  const adapter = new PrismaPg(pool)
  return { client: new PrismaClient({ adapter }), pool }
}

const instance = globalForPrisma.prisma
  ? { client: globalForPrisma.prisma, pool: globalForPrisma.prismaPool }
  : createPrisma()

export const prisma = instance.client

globalForPrisma.prisma = prisma
globalForPrisma.prismaPool = instance.pool

