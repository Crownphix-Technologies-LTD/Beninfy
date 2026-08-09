import type { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requestIp } from '@/lib/rateLimit'

type AuditLogInput = {
  session: Session | null
  req?: Request
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

function jsonMetadata(metadata: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined
  return JSON.parse(JSON.stringify(metadata, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)))
}

export async function writeAuditLog({
  session,
  req,
  action,
  entityType,
  entityId,
  metadata,
}: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: session?.user?.id ?? null,
        actorEmail: session?.user?.email ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        ipAddress: req ? requestIp(req) : null,
        metadata: jsonMetadata(metadata),
      },
    })
  } catch (error) {
    console.error('Audit log write failed', { action, entityType, entityId, error })
  }
}
