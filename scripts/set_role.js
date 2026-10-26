import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  const email = 'crpbenin66@gmail.com'
  const role = 'admin'
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.log('User not found:', email)
    return
  }
  await prisma.user.update({ where: { id: user.id }, data: { role } })
  console.log('Updated', email, 'to role', role)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
