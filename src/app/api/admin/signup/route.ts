import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { notifyAdminUserCreated } from '@/lib/notifications'

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  phone: z.string().trim().min(4).max(30).optional(),
  code: z.string().trim().min(1),
})

export const runtime = 'nodejs'

function getDatabaseConfigError() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return 'DATABASE_URL is missing in deployment settings'
  if (databaseUrl !== databaseUrl.trim()) return 'DATABASE_URL has extra spaces in deployment settings'
  if (databaseUrl.startsWith('"') || databaseUrl.startsWith("'") || databaseUrl.endsWith('"') || databaseUrl.endsWith("'")) {
    return 'DATABASE_URL should be saved in Vercel without wrapping quotes'
  }
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    return 'DATABASE_URL must start with postgresql://'
  }
  if (databaseUrl.includes('[YOUR-PASSWORD]')) return 'DATABASE_URL still contains the password placeholder'
  return null
}

export async function POST(req: Request) {
  try {
    if (process.env.ALLOW_ADMIN_BOOTSTRAP !== 'true') {
      return NextResponse.json({ error: 'Admin bootstrap is disabled' }, { status: 403 })
    }

    const rateLimit = await checkRateLimit({
      scope: 'admin-bootstrap',
      identifier: requestIp(req),
      limit: 5,
      windowMs: 60 * 60 * 1000,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
      )
    }

    const signupCode = process.env.ADMIN_SIGNUP_CODE
    if (!signupCode) {
      return NextResponse.json({ error: 'Admin signup is not configured' }, { status: 503 })
    }

    const databaseConfigError = getDatabaseConfigError()
    if (databaseConfigError) {
      return NextResponse.json({ error: 'Admin bootstrap is unavailable' }, { status: 503 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
    }

    const { name, password, phone, code } = parsed.data
    const email = parsed.data.email.toLowerCase()
    if (code !== signupCode) {
      return NextResponse.json({ error: 'Invalid admin signup code' }, { status: 403 })
    }

    const { prisma } = await import('@/lib/prisma')
    const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    if (!configuredAdminEmail || email !== configuredAdminEmail) {
      return NextResponse.json({ error: 'Invalid bootstrap account' }, { status: 403 })
    }

    const adminCount = await prisma.user.count({
      where: { role: { in: ['admin', 'super_admin'] } },
    })
    if (adminCount > 0) {
      return NextResponse.json({ error: 'Admin bootstrap is no longer available' }, { status: 403 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { name, email, hashedPassword, phone, role: 'super_admin' },
      select: { id: true, name: true, email: true, role: true },
    })

    await notifyAdminUserCreated(user.id)

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    console.error('Admin signup failed', error)
    return NextResponse.json({ error: 'Admin bootstrap failed' }, { status: 500 })
  }
}
