import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { adminRoleCan, isAdminRole, type AdminPermission, type AppRole } from '@/lib/roles'

export type Role = AppRole

export function getRole(session: Session | null): Role | undefined {
  return (session?.user as { role?: Role } | undefined)?.role
}

export async function requireAdmin() {
  const session = (await auth()) as Session | null
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })
  if (!user || !isAdminRole(user.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true as const, session, role: user.role as Role }
}

export async function requireAdminPermission(permission: AdminPermission) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard

  if (!adminRoleCan(guard.role, permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return guard
}

export async function requireSuperAdmin() {
  const session = (await auth()) as Session | null
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Super admin required' }, { status: 403 }),
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })
  if (!user || user.role !== 'super_admin') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Super admin required' }, { status: 403 }),
    }
  }

  return { ok: true as const, session, role: 'super_admin' as const }
}
