import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  const emails = ['gospelafriquetv@gmail.com', 'crpbenin66@gmail.com']
  for (const email of emails) {
    console.log('===', email)
    const user = await prisma.user.findUnique({ where: { email }, include: { accounts: true } })
    if (!user) {
      console.log('No user row')
    } else {
      console.log('User id:', user.id)
      console.log('emailVerified:', user.emailVerified)
      console.log('role:', user.role)
      console.log('accounts:')
      for (const a of user.accounts) {
        console.log(' - account id:', a.id, 'provider:', a.provider, 'providerAccountId:', a.providerAccountId)
      }
    }
  }

  console.log('\nAll google accounts:')
  const accounts = await prisma.account.findMany({ where: { provider: 'google' }, include: { user: true } })
  for (const a of accounts) {
    console.log('---')
    console.log('account.id:', a.id)
    console.log('providerAccountId:', a.providerAccountId)
    console.log('userId:', a.userId)
    console.log('user.email:', a.user?.email)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
