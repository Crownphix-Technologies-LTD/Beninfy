import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { writeAuditLog } from '@/lib/auditLog'
import { prisma } from '@/lib/prisma'
import { notifyPasswordChanged } from '@/lib/notifications'

const schema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).max(100),
})

export async function PATCH(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: guard.session.user!.id },
    select: { id: true, hashedPassword: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (user.hashedPassword) {
    if (!parsed.data.currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
    }
    const matches = await bcrypt.compare(parsed.data.currentPassword, user.hashedPassword)
    if (!matches) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
  }

  const hashedPassword = await bcrypt.hash(parsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      hashedPassword,
      sessionVersion: { increment: 1 },
    },
  })

  await notifyPasswordChanged(user.id, 'self')
  await writeAuditLog({
    session: guard.session,
    req,
    action: 'password_change',
    entityType: 'user',
    entityId: user.id,
  })

  return NextResponse.json({ ok: true })
}
