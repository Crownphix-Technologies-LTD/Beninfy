import type { Prisma } from '@prisma/client'

export function accountAccessBlocked(user: {
  disabledAt: Date | null
  deletionRequestedAt: Date | null
  anonymizedAt: Date | null
}) {
  return Boolean(user.disabledAt || user.deletionRequestedAt || user.anonymizedAt)
}

// Shared by the authenticated mobile flow and the email-verified public flow.
// Callers must verify ownership BEFORE calling this internal transaction helper.
export function accountDeletionGraceDays() {
  const days = Number(process.env.ACCOUNT_DELETION_GRACE_DAYS ?? 30)
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new Error('Invalid account deletion grace period configuration')
  }
  return days
}

export async function scheduleCustomerAccountDeletion(
  tx: Prisma.TransactionClient,
  userId: string,
  proof: {
    channel: 'mobile' | 'public_web'
    verification: 'password' | 'recent_session' | 'email_otp'
  }
) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
  const user = await tx.user.findUnique({ where: { id: userId } })
  if (!user || user.role !== 'user' || user.anonymizedAt) return null
  if (user.deletionRequestedAt && user.scheduledDeletionAt) {
    return {
      status: 'pending' as const,
      requestedAt: user.deletionRequestedAt.toISOString(),
      scheduledAt: user.scheduledDeletionAt.toISOString(),
      anonymizedAt: null,
    }
  }
  const now = new Date()
  const scheduledAt = new Date(now.getTime() + accountDeletionGraceDays() * 86400000)
  await tx.user.update({
    where: { id: userId },
    data: {
      disabledAt: now,
      deletionRequestedAt: now,
      scheduledDeletionAt: scheduledAt,
      deletionCancelledAt: null,
      sessionVersion: { increment: 1 },
    },
  })
  await tx.mobileSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  })
  await tx.pushDevice.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, invalidatedAt: now },
  })
  await tx.auditLog.create({
    data: {
      actorId: userId,
      action: 'customer.account.deletion_requested',
      entityType: 'user',
      entityId: userId,
      metadata: proof,
    },
  })
  return {
    status: 'pending' as const,
    requestedAt: now.toISOString(),
    scheduledAt: scheduledAt.toISOString(),
    anonymizedAt: null,
  }
}
