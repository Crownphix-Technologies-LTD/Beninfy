import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { adminRoleCan } from '@/lib/roles'
import { resolveNotificationLanguagePreference } from '@/lib/mobile/notifications'
import {
  MAX_NOTIFICATION_RECIPIENTS,
  notificationPreviewSchema,
  notificationConfirmSchema,
  announcementContentSchema,
  confirmationPhrase,
  type NotificationAudience,
} from './notificationContract'

type Db = Prisma.TransactionClient
export class NotificationManagementError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export async function authorizeNotificationActor(actorId: string | undefined) {
  if (!actorId) throw new NotificationManagementError(403, 'Forbidden')
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { role: true, disabledAt: true, deletionRequestedAt: true, anonymizedAt: true },
  })
  if (
    !user ||
    !adminRoleCan(user.role, 'users') ||
    user.disabledAt ||
    user.deletionRequestedAt ||
    user.anonymizedAt
  )
    throw new NotificationManagementError(403, 'Forbidden')
  return actorId
}
const activeUser = { disabledAt: null, deletionRequestedAt: null, anonymizedAt: null }
const appType = (audience: string) =>
  audience === 'driver' || audience === 'all_drivers' ? 'driver' : 'customer'
function recipientWhere(audience: string, recipientId?: string | null): Prisma.UserWhereInput {
  return {
    ...activeUser,
    role: appType(audience) === 'customer' ? 'user' : 'driver',
    ...(audience.startsWith('all_') ? {} : { id: recipientId ?? '' }),
  }
}
// Match the existing worker's device/session eligibility; never select token material.
const eligibleDeviceSql = Prisma.sql`
  d."revokedAt" IS NULL AND d."invalidatedAt" IS NULL
  AND u."disabledAt" IS NULL AND u."deletionRequestedAt" IS NULL AND u."anonymizedAt" IS NULL
  AND ((d."appType" = 'driver' AND d."sessionId" IS NULL)
    OR EXISTS (SELECT 1 FROM "MobileSession" s WHERE s.id = d."sessionId"
      AND s."userId" = d."userId" AND s."revokedAt" IS NULL AND s."expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')))`
async function audienceSnapshot(db: Db, audience: string, recipientId?: string | null) {
  const users = await db.user.findMany({
    where: recipientWhere(audience, recipientId),
    orderBy: { id: 'asc' },
    take: MAX_NOTIFICATION_RECIPIENTS + 1,
    select: { id: true, locale: true },
  })
  if (!users.length) throw new NotificationManagementError(400, 'No eligible recipients')
  if (users.length > MAX_NOTIFICATION_RECIPIENTS)
    throw new NotificationManagementError(
      400,
      `This release supports at most ${MAX_NOTIFICATION_RECIPIENTS.toLocaleString('en-US')} recipients per broadcast. No notifications were created.`
    )
  const devices = await db.$queryRaw<
    Array<{ id: string; userId: string; language: string }>
  >(Prisma.sql`
    SELECT d.id, d."userId", d.language FROM "PushDevice" d JOIN "User" u ON u.id = d."userId"
    WHERE d."appType" = ${appType(audience)} AND d."userId" IN (${Prisma.join(users.map((u) => u.id))})
    AND ${eligibleDeviceSql} ORDER BY d."lastSeenAt" DESC, d.id ASC LIMIT 20001`)
  if (devices.length > 20000)
    throw new NotificationManagementError(
      400,
      'This audience exceeds the 20,000 active-device limit. No notifications were created.'
    )
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        users: users.map((u) => u.id),
        devices: devices.map((d) => d.id).sort(),
      })
    )
    .digest('hex')
  return { users, devices, hash }
}
function campaignDto(
  row: Awaited<ReturnType<typeof prisma.adminNotificationCampaign.findUniqueOrThrow>>,
  recipient: { name: string | null; email: string | null } | null
) {
  return {
    id: row.id,
    audience: row.audience,
    recipientCount: row.recipientCount,
    deviceCount: row.deviceCount,
    content: announcementContentSchema.parse(row.content),
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    confirmation: confirmationPhrase(row.audience, row.recipientCount),
    recipient,
  }
}
export async function previewAdminNotification(actorId: string | undefined, input: unknown) {
  const actor = await authorizeNotificationActor(actorId)
  const parsed = notificationPreviewSchema.safeParse(input)
  if (!parsed.success)
    throw new NotificationManagementError(
      400,
      'Select an audience and provide EN/FR plain-text titles (1–100) and messages (1–1,000 characters).'
    )
  const data = parsed.data
  const requestKey = actor + ':' + data.requestId
  return prisma.$transaction(
    async (tx) => {
      // Same request key always yields the same immutable preview, including concurrent retries.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestKey}, 0))::text`
      let row = await tx.adminNotificationCampaign.findUnique({ where: { requestKey } })
      if (row) {
        if (
          row.audience !== data.audience ||
          row.recipientId !== (data.recipientId ?? null) ||
          JSON.stringify(announcementContentSchema.parse(row.content)) !==
            JSON.stringify(data.content)
        )
          throw new NotificationManagementError(
            409,
            'This request was already used for different content. Start a new notification.'
          )
      } else {
        const snapshot = await audienceSnapshot(tx, data.audience, data.recipientId)
        row = await tx.adminNotificationCampaign.create({
          data: {
            actorId: actor,
            requestKey,
            audience: data.audience,
            recipientId: data.recipientId,
            content: data.content,
            recipientCount: snapshot.users.length,
            deviceCount: snapshot.devices.length,
            audienceHash: snapshot.hash,
            expiresAt: new Date(Date.now() + 10 * 60000),
          },
        })
      }
      const recipient = row.recipientId
        ? await tx.user.findUnique({
            where: { id: row.recipientId },
            select: { name: true, email: true },
          })
        : null
      return campaignDto(row, recipient)
    },
    { timeout: 15000 }
  )
}
export async function queueAdminNotification(actorId: string | undefined, input: unknown) {
  const actor = await authorizeNotificationActor(actorId)
  const parsed = notificationConfirmSchema.safeParse(input)
  if (!parsed.success) throw new NotificationManagementError(400, 'Invalid confirmation')
  const { campaignId, confirmation } = parsed.data
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AdminNotificationCampaign" WHERE id = ${campaignId} FOR UPDATE`
      const campaign = await tx.adminNotificationCampaign.findUnique({ where: { id: campaignId } })
      if (!campaign || campaign.actorId !== actor)
        throw new NotificationManagementError(404, 'Preview not found')
      if (confirmation !== confirmationPhrase(campaign.audience, campaign.recipientCount))
        throw new NotificationManagementError(
          400,
          'Type the exact confirmation shown in the preview'
        )
      if (campaign.status === 'queued')
        return {
          id: campaign.id,
          status: 'queued',
          recipientCount: campaign.recipientCount,
          duplicate: true,
        }
      if (campaign.expiresAt <= new Date())
        throw new NotificationManagementError(409, 'Preview expired. Review a new preview.')
      const snapshot = await audienceSnapshot(tx, campaign.audience, campaign.recipientId)
      if (snapshot.hash !== campaign.audienceHash)
        throw new NotificationManagementError(
          409,
          'Audience or active devices changed. Review a new preview before sending.'
        )
      const content = announcementContentSchema.parse(campaign.content)
      const byUser = new Map<string, typeof snapshot.devices>()
      for (const device of snapshot.devices)
        byUser.set(device.userId, [...(byUser.get(device.userId) ?? []), device])
      // Bounded DB batches only. No provider/network calls are made in this transaction.
      for (let offset = 0; offset < snapshot.users.length; offset += 250) {
        const rows = snapshot.users.slice(offset, offset + 250).map((user) => {
          const devices = byUser.get(user.id) ?? []
          const language = resolveNotificationLanguagePreference({
            userLocale: user.locale,
            deviceLanguage: devices[0]?.language,
          })
          return {
            id: randomUUID(),
            userId: user.id,
            appType: appType(campaign.audience),
            type: 'admin.message',
            campaignId: campaign.id,
            language,
            ...content[language],
            payload: { version: 1, type: 'admin.message' },
            dedupeKey: `admin:${campaign.id}:${user.id}`,
            deliveryState: devices.length ? 'pending' : 'skipped_no_device',
          }
        })
        await tx.notification.createMany({ data: rows })
        const deliveries = rows.flatMap((row) =>
          (byUser.get(row.userId) ?? []).map((device) => ({
            notificationId: row.id,
            pushDeviceId: device.id,
            provider: 'fcm',
            status: 'pending',
          }))
        )
        for (let i = 0; i < deliveries.length; i += 500)
          await tx.notificationDelivery.createMany({ data: deliveries.slice(i, i + 500) })
      }
      await tx.adminNotificationCampaign.update({
        where: { id: campaign.id },
        data: { status: 'queued', queuedAt: new Date() },
      })
      // Audit is mandatory and atomic: failure rolls back the enqueue, not an already sent message.
      await tx.auditLog.create({
        data: {
          actorId: actor,
          action: 'notification.queued',
          entityType: 'notification_campaign',
          entityId: campaign.id,
          metadata: {
            audience: campaign.audience,
            recipientId: campaign.recipientId,
            recipientCount: campaign.recipientCount,
            deviceCount: campaign.deviceCount,
            result: 'queued',
          },
        },
      })
      return {
        id: campaign.id,
        status: 'queued',
        recipientCount: campaign.recipientCount,
        duplicate: false,
      }
    },
    { timeout: 30000, maxWait: 5000 }
  )
}
export async function searchNotificationRecipients(
  actorId: string | undefined,
  audience: NotificationAudience,
  query: string
) {
  await authorizeNotificationActor(actorId)
  const q = query.trim().slice(0, 100)
  if (q.length < 2 || audience.startsWith('all_')) return []
  return prisma.user.findMany({
    where: {
      ...recipientWhere(audience.startsWith('all_') ? audience : `all_${audience}s`),
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 20,
    select: { id: true, name: true, email: true },
  })
}
async function deliverySummary(campaignId: string) {
  const [groups, noActiveDevice] = await Promise.all([
    prisma.notificationDelivery.groupBy({
      by: ['status'],
      where: { notification: { campaignId } },
      _count: { _all: true },
    }),
    prisma.notification.count({ where: { campaignId, deliveryState: 'skipped_no_device' } }),
  ])
  return {
    deliverySummary: Object.fromEntries(groups.map((g) => [g.status, g._count._all])),
    noActiveDevice,
  }
}
export async function adminNotificationDetail(actorId: string | undefined, id: string) {
  await authorizeNotificationActor(actorId)
  const row = await prisma.adminNotificationCampaign.findUnique({ where: { id } })
  if (!row) throw new NotificationManagementError(404, 'Notification not found')
  const recipient = row.recipientId
    ? await prisma.user.findUnique({
        where: { id: row.recipientId },
        select: { name: true, email: true },
      })
    : null
  return {
    ...campaignDto(row, recipient),
    createdAt: row.createdAt.toISOString(),
    queuedAt: row.queuedAt?.toISOString() ?? null,
    ...(await deliverySummary(id)),
  }
}
export async function adminNotificationDashboard(actorId: string | undefined, cursor?: string) {
  await authorizeNotificationActor(actorId)
  const [notifications, deliveryGroups, deviceGroups, rows] = await Promise.all([
    prisma.notification.count(),
    prisma.notificationDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.$queryRaw<Array<{ appType: string; count: bigint }>>(
      Prisma.sql`SELECT d."appType", COUNT(*) AS count FROM "PushDevice" d JOIN "User" u ON u.id = d."userId" WHERE ${eligibleDeviceSql} GROUP BY d."appType"`
    ),
    prisma.adminNotificationCampaign.findMany({
      where: { status: 'queued' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  ])
  const counts = Object.fromEntries(deliveryGroups.map((g) => [g.status, g._count._all]))
  const history = await Promise.all(
    rows.slice(0, 20).map(async (row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      queuedAt: row.queuedAt?.toISOString() ?? null,
      audience: row.audience,
      title: announcementContentSchema.parse(row.content).en.title,
      type: 'admin.message',
      recipientCount: row.recipientCount,
      status: row.status,
      ...(await deliverySummary(row.id)),
    }))
  )
  return {
    metrics: {
      notifications,
      pending: counts.pending ?? 0,
      sent: counts.sent ?? 0,
      failed: (counts.failed ?? 0) + (counts.blocked ?? 0),
      customerDevices: Number(deviceGroups.find((g) => g.appType === 'customer')?.count ?? 0),
      driverDevices: Number(deviceGroups.find((g) => g.appType === 'driver')?.count ?? 0),
    },
    history,
    nextCursor: rows.length > 20 ? history.at(-1)!.id : null,
  }
}

export async function rejectedNotificationAuditMetadata(actorId: string, input: unknown) {
  const parsed = notificationConfirmSchema.safeParse(input)
  const row = parsed.success
    ? await prisma.adminNotificationCampaign.findFirst({
        where: { id: parsed.data.campaignId, actorId },
        select: { id: true, audience: true, recipientId: true, recipientCount: true },
      })
    : null
  return {
    campaignId: row?.id ?? null,
    audience: row?.audience ?? null,
    recipientId: row?.recipientId ?? null,
    recipientCount: row?.recipientCount ?? null,
    result: 'rejected',
  }
}
