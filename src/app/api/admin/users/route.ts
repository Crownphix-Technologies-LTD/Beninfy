import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { requireAdminPermission, requireSuperAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { prisma } from '@/lib/prisma'
import { notifyAdminUserCreated } from '@/lib/notifications'

export async function GET(req: Request) {
  const guard = await requireAdminPermission('users')
  if (!guard.ok) return guard.response
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
      _count: { select: { bookings: true } },
    },
    take: 200,
  })
  return NextResponse.json({ users, viewerRole: guard.role })
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().trim().min(4).max(30).optional(),
  role: z.enum([
    'user',
    'admin',
    'operations_admin',
    'finance_admin',
    'fleet_admin',
    'pricing_admin',
    'support_admin',
    'content_admin',
  ]).default('admin'),
})

export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { name, password, phone, role } = parsed.data
  const email = parsed.data.email.trim().toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  const hashedPassword = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { name, email, hashedPassword, phone, role },
    select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
  })
  await notifyAdminUserCreated(user.id)
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'create',
    entityType: 'user',
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role,
    },
  })
  return NextResponse.json({ user }, { status: 201 })
}

const patchSchema = z.object({
  role: z.enum([
    'user',
    'admin',
    'super_admin',
    'operations_admin',
    'finance_admin',
    'fleet_admin',
    'pricing_admin',
    'support_admin',
    'content_admin',
  ]).optional(),
  name: z.string().min(1).max(100).optional(),
  phone: z.string().nullable().optional(),
})

export async function PATCH(req: Request) {
  const guard = await requireAdminPermission('users')
  if (!guard.ok) return guard.response
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  if (parsed.data.role && guard.role !== 'super_admin') {
    return NextResponse.json({ error: 'Only super admin can change roles' }, { status: 403 })
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true, name: true, phone: true } })
  if (parsed.data.role) {
    if (target?.role === 'super_admin' && parsed.data.role !== 'super_admin') {
      return NextResponse.json({ error: 'Cannot demote a super admin' }, { status: 403 })
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: { id: true, name: true, email: true, phone: true, role: true },
  })
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'update',
    entityType: 'user',
    entityId: user.id,
    metadata: {
      previous: target,
      next: user,
    },
  })
  return NextResponse.json({ user })
}

export async function DELETE(req: Request) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (id === guard.session?.user?.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true, name: true } })
  if (target?.role === 'super_admin') {
    return NextResponse.json({ error: 'Cannot delete a super admin' }, { status: 403 })
  }
  await prisma.user.delete({ where: { id } })
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'delete',
    entityType: 'user',
    entityId: id,
    metadata: { previous: target },
  })
  return NextResponse.json({ ok: true })
}
