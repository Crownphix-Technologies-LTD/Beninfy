import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { prisma } from '@/lib/prisma'
import { notifyPasswordChanged } from '@/lib/notifications'

const schema = z.object({
  password: z.string().min(8).max(100),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  })
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (target.role === 'super_admin' && target.id !== guard.session.user!.id) {
    return NextResponse.json({ error: 'Cannot reset another super admin password' }, { status: 403 })
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12)
  await prisma.user.update({
    where: { id },
    data: {
      hashedPassword,
      sessionVersion: { increment: 1 },
    },
  })

  await notifyPasswordChanged(id, 'admin_reset')
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'password_reset',
    entityType: 'user',
    entityId: id,
    metadata: { targetRole: target.role },
  })

  return NextResponse.json({ ok: true })
}
