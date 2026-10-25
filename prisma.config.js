import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.PRISMA_MIGRATE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
  migrations: {
    path: 'prisma/migrations',
  },
})
