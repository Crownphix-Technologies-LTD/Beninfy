import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  console.log('DATABASE_URL:', !!process.env.DATABASE_URL)
  const accounts = await prisma.account.findMany({
    where: { provider: 'google' },
    orderBy: { id: 'desc' },
    take: 20,
    include: { user: true },
  })
  if (accounts.length === 0) {
    console.log('No google accounts found.')
  } else {
    for (const a of accounts) {
      console.log('---')
      console.log('Account id:', a.id)
      console.log('providerAccountId:', a.providerAccountId)
      console.log('provider:', a.provider)
      console.log('userId:', a.userId)
      console.log('user email:', a.user?.email)
      console.log('user.emailVerified:', a.user?.emailVerified)
      console.log('user.role:', a.user?.role)
      console.log('createdAt?:', a.createdAt)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
