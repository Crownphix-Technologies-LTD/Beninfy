import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  const accounts = await prisma.account.findMany({ where: { provider: 'google' }, include: { user: true } })
  let changed = 0
  for (const a of accounts) {
    if (a.user && a.user.role !== 'user') {
      console.log('Fixing user', a.user.email, 'from', a.user.role, 'to user')
      await prisma.user.update({ where: { id: a.userId }, data: { role: 'user' } })
      changed++
    }
  }
  console.log('Changed:', changed)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
