import { prisma } from '@/lib/prisma'
import { deleteStorageImageByPublicUrl } from '@/lib/supabaseStorage'

export const AVATAR_CLEANUP_MAX_ATTEMPTS = 8
export function deletionWorkerTake(take = 25) {
  return Number.isSafeInteger(take) ? Math.min(Math.max(take, 1), 100) : 25
}

const dueUsers = (now: Date) => ({
  role: 'user',
  deletionRequestedAt: { not: null },
  scheduledDeletionAt: { lte: now },
  anonymizedAt: null,
})

export async function anonymizeDueCustomerAccounts(
  input: { now?: Date; take?: number; deadline?: number } = {},
  db = prisma
) {
  const now = input.now ?? new Date()
  // This is only a bounded candidate scan. No destructive action trusts it.
  const users = await db.user.findMany({
    where: dueUsers(now),
    select: { id: true },
    orderBy: [{ scheduledDeletionAt: 'asc' }, { id: 'asc' }],
    take: deletionWorkerTake(input.take),
  })
  let processed = 0,
    failed = 0,
    skipped = 0
  for (const candidate of users) {
    if (input.deadline && Date.now() >= input.deadline) break
    try {
      const changed = await db.$transaction(
        async (tx) => {
          // Same first lock as request scheduling and restoration. Under READ
          // COMMITTED the subsequent read observes a restoration that won the lock.
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.id} FOR UPDATE`
          const user = await tx.user.findFirst({ where: { id: candidate.id, ...dueUsers(now) } })
          if (!user) return false
          await tx.savedPlace.deleteMany({ where: { userId: user.id } })
          await tx.customerTravelPreference.deleteMany({ where: { userId: user.id } })
          await tx.tripReview.deleteMany({ where: { customerId: user.id } })
          await tx.otpChallenge.deleteMany({ where: { userId: user.id } })
          await tx.passwordResetToken.deleteMany({ where: { userId: user.id } })
          await tx.account.deleteMany({ where: { userId: user.id } })
          await tx.session.deleteMany({ where: { userId: user.id } })
          await tx.mobileSession.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: now },
          })
          await tx.pushDevice.updateMany({
            where: { userId: user.id },
            data: { revokedAt: now, invalidatedAt: now },
          })
          if (user.image) {
            await tx.accountDeletionCleanup.create({
              data: { userId: user.id, avatarUrl: user.image },
            })
          }
          await tx.user.update({
            where: { id: user.id },
            data: {
              name: 'Deleted Beninfy Customer',
              email: `deleted+${user.id}@deleted.beninfy.local`,
              emailVerified: null,
              image: null,
              phone: null,
              hashedPassword: null,
              locale: null,
              anonymizedAt: now,
              disabledAt: now,
              sessionVersion: { increment: 1 },
            },
          })
          await tx.auditLog.create({
            data: {
              action: 'customer.account.anonymized',
              entityType: 'user',
              entityId: user.id,
              metadata: { avatarCleanupQueued: Boolean(user.image) },
            },
          })
          return true
        },
        { isolationLevel: 'ReadCommitted', maxWait: 1000, timeout: 5000 }
      )
      if (changed) processed++
      else skipped++
    } catch {
      // Pending state survives rollback. Continue the batch instead of allowing
      // one failed account to starve every later account. Never log raw DB errors.
      failed++
    }
  }
  return { checked: users.length, processed, failed, skipped }
}

export async function restorePendingCustomerDeletion(
  input: { userId: string; actorId?: string },
  db = prisma
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`
      const user = await tx.user.findUnique({ where: { id: input.userId } })
      const now = new Date()
      if (!user || user.role !== 'user' || !user.deletionRequestedAt || user.anonymizedAt)
        return { ok: false, cancelledAt: now.toISOString() }
      await tx.user.update({
        where: { id: user.id },
        data: {
          disabledAt: null,
          deletionRequestedAt: null,
          scheduledDeletionAt: null,
          deletionCancelledAt: now,
          sessionVersion: { increment: 1 },
        },
      })
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'restore_deletion',
          entityType: 'user',
          entityId: user.id,
          metadata: { cancelledAt: now.toISOString() },
        },
      })
      return { ok: true, cancelledAt: now.toISOString() }
    },
    { isolationLevel: 'ReadCommitted' }
  )
}

export async function processAccountAvatarCleanups(
  input: { now?: Date; take?: number; deadline?: number } = {},
  db = prisma
) {
  const now = input.now ?? new Date()
  const jobs = await db.accountDeletionCleanup.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: now } },
    select: { id: true },
    orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
    take: deletionWorkerTake(input.take),
  })
  const counts = { checked: jobs.length, succeeded: 0, failed: 0, blocked: 0, skipped: 0 }
  for (const candidate of jobs) {
    if (input.deadline && Date.now() >= input.deadline) break
    try {
      const status = await db.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "AccountDeletionCleanup" WHERE id = ${candidate.id} FOR UPDATE SKIP LOCKED`
          if (!locked.length) return 'skipped' as const
          const job = await tx.accountDeletionCleanup.findUniqueOrThrow({
            where: { id: candidate.id },
            include: { user: true },
          })
          if (job.status !== 'pending' || job.nextAttemptAt > now) return 'skipped' as const
          if (!job.user.anonymizedAt || !job.user.disabledAt) {
            await tx.accountDeletionCleanup.update({
              where: { id: job.id },
              data: { status: 'blocked', errorCode: 'account_not_anonymized' },
            })
            return 'blocked' as const
          }
          let ok = false
          try {
            // Runs only after the transaction that created this job committed.
            // Bound the external call while holding the cleanup lock. A crash after
            // provider success safely retries the same DELETE (404 is success).
            const result = await deleteStorageImageByPublicUrl(job.avatarUrl, {
              avatarUserId: job.userId,
              signal: AbortSignal.timeout(5000),
            })
            ok = result.ok
          } catch {
            /* Persist only a fixed category, never provider text/URL. */
          }
          const attempts = job.attempts + 1
          if (ok) {
            await tx.accountDeletionCleanup.update({
              where: { id: job.id },
              data: {
                status: 'succeeded',
                attempts,
                completedAt: now,
                lastAttemptAt: now,
                avatarUrl: null,
                errorCode: null,
              },
            })
            await tx.auditLog.create({
              data: {
                action: 'customer.account.avatar_cleaned',
                entityType: 'user',
                entityId: job.userId,
              },
            })
            return 'succeeded' as const
          }
          const blocked = attempts >= AVATAR_CLEANUP_MAX_ATTEMPTS
          await tx.accountDeletionCleanup.update({
            where: { id: job.id },
            data: {
              status: blocked ? 'blocked' : 'pending',
              attempts,
              lastAttemptAt: now,
              nextAttemptAt: new Date(
                now.getTime() + Math.min(86400000, 300000 * 2 ** (attempts - 1))
              ),
              errorCode: 'avatar_cleanup_unavailable',
            },
          })
          return blocked ? ('blocked' as const) : ('failed' as const)
        },
        { isolationLevel: 'ReadCommitted', maxWait: 1000, timeout: 10000 }
      )
      counts[status]++
    } catch {
      // Transaction rollback retains the original URL/job for the next run.
      counts.failed++
    }
  }
  return counts
}

export async function accountDeletionWorkerMetrics(now = new Date()) {
  const [eligible, oldest, retryBacklog, blocked, oldestCleanup] = await Promise.all([
    prisma.user.count({ where: dueUsers(now) }),
    prisma.user.findFirst({
      where: dueUsers(now),
      orderBy: { scheduledDeletionAt: 'asc' },
      select: { scheduledDeletionAt: true },
    }),
    prisma.accountDeletionCleanup.count({ where: { status: 'pending' } }),
    prisma.accountDeletionCleanup.count({ where: { status: 'blocked' } }),
    prisma.accountDeletionCleanup.findFirst({
      where: { status: { in: ['pending', 'blocked'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])
  return {
    eligible,
    oldestOverdueAt: oldest?.scheduledDeletionAt?.toISOString() ?? null,
    retryBacklog,
    blocked,
    oldestCleanupAt: oldestCleanup?.createdAt.toISOString() ?? null,
  }
}
