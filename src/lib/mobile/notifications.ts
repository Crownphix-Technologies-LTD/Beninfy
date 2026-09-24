import { announcementContentSchema } from '@/lib/admin/notificationContract'
import { pushLog } from '@/lib/mobile/pushDevices'
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import { getFcmProvider } from '@/lib/mobile/fcm'
import { prisma } from '@/lib/prisma'

export type PushAppType = 'customer' | 'driver'
export type PushPlatform = 'android' | 'ios'
export type NotificationLanguage = 'en' | 'fr'
export type NotificationDeliveryState =
  | 'blocked'
  | 'pending'
  | 'sent'
  | 'failed'
  | 'invalid_token'
  | 'skipped'
  | 'skipped_no_device'

export type NotificationType =
  | 'admin.message'
  | 'tour.booking_confirmed'
  | 'tour.payment_confirmed'
  | 'tour.cancelled'
  | 'tour.status_updated'
  | 'booking.confirmed'
  | 'payment.confirmed'
  | 'payment.failed'
  | 'chat.new_message'
  | 'trip.driver_assigned'
  | 'trip.assignment_removed'
  | 'trip.assignment_changed'
  | 'trip.driver_en_route'
  | 'trip.driver_arrived'
  | 'trip.started'
  | 'trip.completed'
  | 'trip.cancelled'
  | 'payment_resolution.under_review'
  | 'refund.approved'
  | 'refund.processing'
  | 'refund.completed'
  | 'refund.rejected'

export type PushPayload = {
  tourBookingId?: string
  entityType?: 'ride' | 'tour'
  entityId?: string
  type: NotificationType
  version: 1
  bookingId?: string
  bookingLegId?: string
  paymentId?: string
  paymentResolutionId?: string
  conversationId?: string
  messageId?: string
}

type ProviderSendInput = {
  token: string
  title: string
  body: string
  data: Record<string, string>
}

type ProviderSendResult =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false
      classification: 'transient' | 'invalid_token' | 'configuration'
      errorCode: string
    }

export type PushNotificationProvider = {
  name: string
  send(input: ProviderSendInput): Promise<ProviderSendResult>
}

const MAX_RETRY_ATTEMPTS = 3

const templates: Record<
  Exclude<NotificationType, 'admin.message'>,
  Record<NotificationLanguage, { title: string; body: string }>
> = {
  'tour.booking_confirmed': {
    en: {
      title: 'Tour confirmed',
      body: 'Your Beninfy Tour is confirmed. Open the app for details.',
    },
    fr: {
      title: 'Circuit confirmé',
      body: 'Votre circuit Beninfy est confirmé. Consultez les détails dans l’application.',
    },
  },
  'tour.payment_confirmed': {
    en: {
      title: 'Tour payment received',
      body: 'Your Tour payment is confirmed. Open the app for details.',
    },
    fr: {
      title: 'Paiement du circuit reçu',
      body: 'Le paiement de votre circuit est confirmé. Consultez l’application.',
    },
  },
  'tour.cancelled': {
    en: {
      title: 'Tour cancelled',
      body: 'Your Beninfy Tour has been cancelled. Open the app for details.',
    },
    fr: {
      title: 'Circuit annulé',
      body: 'Votre circuit Beninfy a été annulé. Consultez l’application.',
    },
  },
  'tour.status_updated': {
    en: {
      title: 'Tour day updated',
      body: 'Your Tour day has an update. Open the app for the latest status.',
    },
    fr: {
      title: 'Journée du circuit mise à jour',
      body: 'Le statut de votre journée a changé. Consultez l’application.',
    },
  },
  'booking.confirmed': {
    en: {
      title: 'Booking confirmed',
      body: 'Your Beninfy ride is confirmed. Operations will coordinate your trip details.',
    },
    fr: {
      title: 'Reservation confirmee',
      body: 'Votre trajet Beninfy est confirme. Notre equipe coordonnera les details du voyage.',
    },
  },
  'payment.confirmed': {
    en: {
      title: 'Payment received',
      body: 'Your payment was received and your ride is now confirmed.',
    },
    fr: {
      title: 'Paiement recu',
      body: 'Votre paiement a ete recu et votre trajet est maintenant confirme.',
    },
  },
  'payment.failed': {
    en: {
      title: 'Payment not completed',
      body: 'Your payment was not completed. Please try again or contact support.',
    },
    fr: {
      title: 'Paiement non finalise',
      body: 'Votre paiement n a pas ete finalise. Veuillez reessayer ou contacter le support.',
    },
  },
  'chat.new_message': {
    en: {
      title: 'New trip message',
      body: 'You have a new Beninfy trip message.',
    },
    fr: {
      title: 'Nouveau message de trajet',
      body: 'Vous avez un nouveau message pour votre trajet Beninfy.',
    },
  },
  'trip.driver_assigned': {
    en: { title: 'Driver assigned', body: 'A Beninfy driver has been assigned to your trip.' },
    fr: { title: 'Chauffeur assigne', body: 'Un chauffeur Beninfy a ete assigne a votre trajet.' },
  },
  'trip.assignment_removed': {
    en: {
      title: 'Assignment updated',
      body: 'This trip assignment has been removed. Check the driver app for your current trips.',
    },
    fr: {
      title: 'Affectation mise a jour',
      body: 'Cette affectation a ete retiree. Consultez l application chauffeur.',
    },
  },
  'trip.assignment_changed': {
    en: {
      title: 'Trip assignment updated',
      body: 'Your Beninfy trip assignment has been updated by operations.',
    },
    fr: {
      title: 'Affectation mise a jour',
      body: 'L affectation de votre trajet Beninfy a ete mise a jour.',
    },
  },
  'trip.driver_en_route': {
    en: {
      title: 'Driver en route',
      body: 'Your Beninfy driver is on the way to your pickup point.',
    },
    fr: {
      title: 'Chauffeur en route',
      body: 'Votre chauffeur Beninfy est en route vers le point de depart.',
    },
  },
  'trip.driver_arrived': {
    en: { title: 'Driver arrived', body: 'Your Beninfy driver has arrived at the pickup point.' },
    fr: {
      title: 'Chauffeur arrive',
      body: 'Votre chauffeur Beninfy est arrive au point de depart.',
    },
  },
  'trip.started': {
    en: { title: 'Trip started', body: 'Your Beninfy trip has started. Safe travels.' },
    fr: { title: 'Trajet commence', body: 'Votre trajet Beninfy a commence. Bon voyage.' },
  },
  'trip.completed': {
    en: {
      title: 'Trip completed',
      body: 'Your Beninfy trip is complete. Thank you for travelling with us.',
    },
    fr: {
      title: 'Trajet termine',
      body: 'Votre trajet Beninfy est termine. Merci d avoir voyage avec nous.',
    },
  },
  'trip.cancelled': {
    en: {
      title: 'Trip cancelled',
      body: 'This Beninfy trip has been cancelled. Contact support if you need help.',
    },
    fr: {
      title: 'Trajet annule',
      body: 'Ce trajet Beninfy a ete annule. Contactez le support si besoin.',
    },
  },
  'payment_resolution.under_review': {
    en: {
      title: 'Refund review started',
      body: 'Operations is reviewing your payment resolution request.',
    },
    fr: {
      title: 'Examen du remboursement commence',
      body: 'Notre equipe examine votre demande de resolution de paiement.',
    },
  },
  'refund.approved': {
    en: { title: 'Refund approved', body: 'Your refund request has been approved.' },
    fr: {
      title: 'Remboursement approuve',
      body: 'Votre demande de remboursement a ete approuvee.',
    },
  },
  'refund.processing': {
    en: { title: 'Refund processing', body: 'Your refund is being processed by operations.' },
    fr: {
      title: 'Remboursement en cours',
      body: 'Votre remboursement est en cours de traitement.',
    },
  },
  'refund.completed': {
    en: { title: 'Refund completed', body: 'Your refund resolution has been completed.' },
    fr: { title: 'Remboursement termine', body: 'Votre resolution de remboursement est terminee.' },
  },
  'refund.rejected': {
    en: {
      title: 'Refund request closed',
      body: 'Your refund request was not approved. Contact support if you need help.',
    },
    fr: {
      title: 'Demande de remboursement cloturee',
      body: 'Votre demande de remboursement n a pas ete approuvee. Contactez le support si besoin.',
    },
  },
}

const audienceTemplates: Partial<
  Record<
    PushAppType,
    Partial<Record<NotificationType, Record<NotificationLanguage, { title: string; body: string }>>>
  >
> = {
  driver: {
    'trip.driver_assigned': {
      en: { title: 'New trip assigned', body: 'A new trip has been assigned to you.' },
      fr: {
        title: 'Nouveau trajet assigne',
        body: 'Un nouveau trajet vous a ete assigne.',
      },
    },
    'trip.completed': {
      en: { title: 'Trip completed', body: 'Trip completed successfully.' },
      fr: { title: 'Trajet termine', body: 'Trajet termine avec succes.' },
    },
    'trip.cancelled': {
      en: {
        title: 'Trip cancelled',
        body: 'This assigned trip has been cancelled. Check the driver app for current trips.',
      },
      fr: {
        title: 'Trajet annule',
        body: 'Ce trajet assigne a ete annule. Consultez l application chauffeur.',
      },
    },
  },
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token.trim()).digest('hex')
}

export function normalizePushAppType(value: unknown): PushAppType | null {
  return value === 'customer' || value === 'driver' ? value : null
}

export function normalizePushPlatform(value: unknown): PushPlatform | null {
  return value === 'android' || value === 'ios' ? value : null
}

export function normalizeNotificationLanguage(value: unknown): NotificationLanguage {
  if (typeof value !== 'string') return 'en'
  const normalized = value.trim().toLowerCase()
  return normalized === 'fr' || normalized.startsWith('fr-') ? 'fr' : 'en'
}

export function appTypeForPrincipal(principal: MobilePrincipal): PushAppType {
  return principal.type === 'DRIVER' ? 'driver' : 'customer'
}

export function principalOwnsAppType(principal: MobilePrincipal, appType: PushAppType) {
  return appTypeForPrincipal(principal) === appType
}

export function validatePushToken(value: unknown) {
  if (typeof value !== 'string') return false
  const token = value.trim()
  return token.length >= 20 && token.length <= 4096
}

export function templateFor(
  type: NotificationType,
  language: NotificationLanguage,
  appType: PushAppType
) {
  if (type === 'admin.message') return undefined
  const audienceTemplate = audienceTemplates[appType]?.[type]
  return (
    audienceTemplate?.[language] ??
    audienceTemplate?.en ??
    templates[type]?.[language] ??
    templates[type]?.en
  )
}

export function pushPayloadToData(payload: PushPayload): Record<string, string> {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  )
}

export function classifyProviderError(code: string): ProviderSendResult {
  const normalized = code.toLowerCase()
  if (
    normalized.includes('invalid') ||
    normalized.includes('not_registered') ||
    normalized.includes('registration-token-not-registered')
  ) {
    return { ok: false, classification: 'invalid_token', errorCode: code }
  }
  if (
    normalized.includes('unauthorized') ||
    normalized.includes('permission') ||
    normalized.includes('credential') ||
    normalized.includes('configuration')
  ) {
    return { ok: false, classification: 'configuration', errorCode: code }
  }
  return { ok: false, classification: 'transient', errorCode: code }
}

export function getPushProvider(): PushNotificationProvider {
  const provider = (process.env.PUSH_PROVIDER ?? 'disabled').toLowerCase()

  if (provider === 'mock' && process.env.NODE_ENV !== 'production') {
    return {
      name: 'mock',
      async send() {
        return { ok: true, providerMessageId: `mock-${Date.now()}` }
      },
    }
  }
  if (provider === 'fcm') return getFcmProvider()

  return {
    name: 'disabled',
    async send() {
      return {
        ok: false,
        classification: 'configuration',
        errorCode: 'PUSH_PROVIDER_NOT_CONFIGURED',
      }
    },
  }
}

export { registerPushDevice, revokePushDevice } from '@/lib/mobile/pushDevices'

async function resolveLanguage(
  userId: string,
  appType: PushAppType,
  fallback?: NotificationLanguage
) {
  const [user, device] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    }),
    prisma.pushDevice.findFirst({
      where: { userId, appType, revokedAt: null, invalidatedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: { language: true },
    }),
  ])
  return resolveNotificationLanguagePreference({
    userLocale: user?.locale,
    deviceLanguage: device?.language,
    fallback,
  })
}

export function resolveNotificationLanguagePreference({
  userLocale,
  deviceLanguage,
  fallback,
}: {
  userLocale?: string | null
  deviceLanguage?: string | null
  fallback?: NotificationLanguage
}) {
  if (userLocale) return normalizeNotificationLanguage(userLocale)
  if (deviceLanguage) return normalizeNotificationLanguage(deviceLanguage)
  return normalizeNotificationLanguage(fallback)
}

export const CUSTOMER_NOTIFICATION_TYPES = [
  'admin.message',
  'booking.confirmed',
  'payment.confirmed',
  'payment.failed',
  'chat.new_message',
  'trip.driver_assigned',
  'trip.assignment_changed',
  'trip.driver_en_route',
  'trip.driver_arrived',
  'trip.started',
  'trip.completed',
  'trip.cancelled',
  'payment_resolution.under_review',
  'refund.approved',
  'refund.processing',
  'refund.completed',
  'refund.rejected',
  'tour.booking_confirmed',
  'tour.payment_confirmed',
  'tour.cancelled',
  'tour.status_updated',
] as const

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value)
}

export function customerPushData(notification: {
  id: string
  type: string
  payload: unknown
}): Record<string, string> | null {
  if (notification.type === 'admin.message')
    return { version: '1', type: 'admin.message', notificationId: notification.id }
  if (!(CUSTOMER_NOTIFICATION_TYPES as readonly string[]).includes(notification.type)) return null
  if (!notification.payload || typeof notification.payload !== 'object') return null
  const payload = notification.payload as Record<string, unknown>
  const entityType = notification.type.startsWith('tour.') ? 'tour' : 'ride'
  const entityId = entityType === 'tour' ? payload.tourBookingId : payload.bookingId
  if (!safeId(entityId)) return null
  return {
    version: '1',
    type: notification.type,
    entityType,
    entityId,
    notificationId: notification.id,
  }
}

function safePayload(type: NotificationType, payload: PushPayload): PushPayload {
  const result: PushPayload = { type, version: 1 }
  for (const key of [
    'bookingId',
    'bookingLegId',
    'paymentId',
    'paymentResolutionId',
    'conversationId',
    'messageId',
    'tourBookingId',
  ] as const) {
    if (safeId(payload[key])) result[key] = payload[key]
  }
  return result
}

export async function createNotificationEvent({
  userId,
  appType,
  type,
  payload,
  dedupeKey,
  language,
}: {
  userId: string | null | undefined
  appType: PushAppType
  type: NotificationType
  payload: PushPayload
  dedupeKey: string
  language?: NotificationLanguage
}) {
  if (!userId) return null
  try {
    const resolvedLanguage = await resolveLanguage(userId, appType, language)
    const template = templateFor(type, resolvedLanguage, appType)
    if (!template) return null
    const normalized = safePayload(type, payload)
    if (appType === 'customer') {
      const data = customerPushData({ id: 'pending', type, payload: normalized })
      if (!data) return null
      normalized.entityType = data.entityType as 'ride' | 'tour'
      normalized.entityId = data.entityId
    }
    // Notification is the durable outbox. Only the existing worker contacts FCM.
    const notification = await prisma.notification.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        userId,
        appType,
        type,
        language: resolvedLanguage,
        title: template.title,
        body: template.body,
        payload: normalized as Prisma.InputJsonValue,
        dedupeKey,
      },
    })
    pushLog('persisted', { notificationId: notification.id, type, userId, appType })
    return notification
  } catch {
    // Notification transport/persistence must never change the business result.
    pushLog('persistence_failed', { type, userId, appType, category: 'storage' })
    return null
  }
}

export async function deliverNotification(
  notificationId: string,
  provider = getPushProvider(),
  deadline = Date.now() + 45000
) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { campaign: { select: { content: true } } },
  })
  if (!notification) return null
  const data =
    notification.type === 'admin.message' || notification.appType === 'customer'
      ? customerPushData(notification)
      : pushPayloadToData(
          safePayload(notification.type as NotificationType, notification.payload as PushPayload)
        )
  if (!data) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryState: 'skipped' },
    })
    pushLog('dispatch_skipped', {
      notificationId,
      type: notification.type,
      category: 'unsupported_payload',
    })
    return { state: 'skipped' as const }
  }
  // Retire retries for registrations that have been removed, revoked, or transferred.
  // Otherwise an old failed delivery can monopolize the worker retry queue forever.
  await prisma.notificationDelivery.updateMany({
    where: {
      notificationId,
      status: { in: ['pending', 'failed', 'blocked'] },
      OR: [
        { pushDevice: null },
        {
          pushDevice: {
            is: {
              OR: [
                { userId: { not: notification.userId } },
                { appType: { not: notification.appType } },
                { revokedAt: { not: null } },
                { invalidatedAt: { not: null } },
              ],
            },
          },
        },
      ],
    },
    data: { status: 'skipped', nextAttemptAt: null },
  })
  const devices = await prisma.pushDevice.findMany({
    where: {
      userId: notification.userId,
      appType: notification.appType,
      revokedAt: null,
      invalidatedAt: null,
    },
    select: { id: true },
  })
  if (!devices.length) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryState: 'skipped_no_device' },
    })
    pushLog('dispatch_skipped', { notificationId, type: notification.type, category: 'no_device' })
    return { state: 'skipped_no_device' as const }
  }
  for (const candidate of devices) {
    if (Date.now() >= deadline) break
    try {
      await prisma.$transaction(
        async (tx) => {
          // Serializes send with revoke/transfer/refresh, and with concurrent workers.
          await tx.$queryRaw`SELECT id FROM "PushDevice" WHERE id = ${candidate.id} FOR UPDATE`
          const device = await tx.pushDevice.findUnique({
            where: { id: candidate.id },
            include: {
              user: { select: { disabledAt: true, deletionRequestedAt: true, anonymizedAt: true } },
            },
          })
          if (
            !device ||
            device.userId !== notification.userId ||
            device.appType !== notification.appType ||
            device.revokedAt ||
            device.invalidatedAt
          )
            return
          const session = device.sessionId
            ? await tx.mobileSession.findFirst({
                where: {
                  id: device.sessionId,
                  userId: device.userId,
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                },
              })
            : null
          if (
            device.user.disabledAt ||
            device.user.deletionRequestedAt ||
            device.user.anonymizedAt ||
            (device.sessionId && !session) ||
            (device.appType === 'customer' && !session)
          ) {
            await tx.notificationDelivery.updateMany({
              where: {
                notificationId,
                pushDeviceId: device.id,
                status: { in: ['pending', 'failed', 'blocked'] },
              },
              data: { status: 'skipped', nextAttemptAt: null },
            })
            await tx.pushDevice.update({
              where: { id: device.id },
              data: { revokedAt: new Date() },
            })
            pushLog('dispatch_skipped', {
              notificationId,
              deviceId: device.id,
              category: 'session_inactive',
            })
            return
          }
          const where = { notificationId_pushDeviceId: { notificationId, pushDeviceId: device.id } }
          const existing = await tx.notificationDelivery.findUnique({ where })
          if (
            existing &&
            (['sent', 'invalid_token', 'skipped'].includes(existing.status) ||
              existing.attempts >= MAX_RETRY_ATTEMPTS ||
              (existing.nextAttemptAt && existing.nextAttemptAt > new Date()))
          )
            return
          const customContent =
            notification.type === 'admin.message'
              ? announcementContentSchema.safeParse(notification.campaign?.content)
              : null
          const copy = customContent?.success
            ? customContent.data[normalizeNotificationLanguage(device.language)]
            : templateFor(
                notification.type as NotificationType,
                normalizeNotificationLanguage(device.language),
                notification.appType as PushAppType
              )
          if (!copy) return
          pushLog('dispatch_attempted', {
            notificationId,
            deviceId: device.id,
            type: notification.type,
          })
          let result: ProviderSendResult
          try {
            result = await provider.send({
              token: device.token,
              title: copy.title,
              body: copy.body,
              data,
            })
          } catch {
            result = { ok: false, classification: 'transient', errorCode: 'PUSH_SEND_FAILED' }
          }
          const now = new Date()
          const status = result.ok
            ? 'sent'
            : result.classification === 'configuration'
              ? 'blocked'
              : result.classification === 'invalid_token'
                ? 'invalid_token'
                : 'failed'
          const attempts = (existing?.attempts ?? 0) + (status === 'blocked' ? 0 : 1)
          const values = {
            provider: ['fcm', 'mock', 'disabled'].includes(provider.name)
              ? provider.name
              : 'custom',
            status,
            attempts,
            lastAttemptAt: now,
            nextAttemptAt:
              (status === 'failed' && attempts < MAX_RETRY_ATTEMPTS) || status === 'blocked'
                ? new Date(now.getTime() + 5 * 60000)
                : null,
            providerMessageId: result.ok ? (result.providerMessageId ?? null) : null,
            // Only categories are persisted; arbitrary provider error strings may contain secrets.
            errorCode: result.ok ? null : result.classification,
          }
          await tx.notificationDelivery.upsert({
            where,
            create: { notificationId, pushDeviceId: device.id, ...values },
            update: values,
          })
          if (status === 'invalid_token') {
            await tx.pushDevice.update({ where: { id: device.id }, data: { invalidatedAt: now } })
            pushLog('invalid_token_cleanup', {
              notificationId,
              deviceId: device.id,
              category: 'invalid_token',
            })
          }
          pushLog('dispatch_result', {
            notificationId,
            deviceId: device.id,
            type: notification.type,
            status,
            category: result.ok ? 'accepted' : result.classification,
          })
        },
        { timeout: 12000, maxWait: 15000 }
      )
    } catch {
      // Continue fanout; leave any unfinished durable delivery eligible for the worker.
      pushLog('dispatch_failed', {
        notificationId,
        deviceId: candidate.id,
        type: notification.type,
        category: 'storage',
      })
    }
  }
  const deliveries = await prisma.notificationDelivery.findMany({ where: { notificationId } })
  const sent = deliveries.filter((row) => row.status === 'sent').length
  const failed = deliveries.filter((row) => row.status === 'failed').length
  const blocked = deliveries.filter((row) => row.status === 'blocked').length
  const invalid = deliveries.filter((row) => row.status === 'invalid_token').length
  const unfinished = devices.some(
    (device) =>
      !deliveries.some((row) => row.pushDeviceId === device.id && row.status !== 'pending')
  )
  // Unfinished rows are retried only while that device still belongs to this user.
  const active = unfinished
    ? await prisma.pushDevice.count({
        where: {
          id: {
            in: devices
              .filter(
                (device) =>
                  !deliveries.some(
                    (row) => row.pushDeviceId === device.id && row.status !== 'pending'
                  )
              )
              .map((device) => device.id),
          },
          userId: notification.userId,
          appType: notification.appType,
          revokedAt: null,
          invalidatedAt: null,
        },
      })
    : 0
  const state = active
    ? 'pending'
    : blocked
      ? 'blocked'
      : failed
        ? 'failed'
        : sent
          ? 'sent'
          : invalid
            ? 'invalid_token'
            : 'skipped_no_device'
  await prisma.notification.update({
    where: { id: notificationId },
    data: { deliveryState: state },
  })
  return { state, sent, failed, blocked, invalid }
}

export async function processDueNotificationDeliveries({
  take = 50,
  now = new Date(),
  provider = getPushProvider(),
}: {
  take?: number
  now?: Date
  provider?: PushNotificationProvider
} = {}) {
  const batchSize = Number.isFinite(take) ? Math.min(200, Math.max(1, Math.floor(take))) : 50
  const rows = await prisma.notificationDelivery.findMany({
    where: {
      status: { in: ['failed', 'blocked'] },
      attempts: { lt: MAX_RETRY_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    take: batchSize,
    select: { notificationId: true },
  })
  const ids = new Set(rows.map((row) => row.notificationId))
  if (ids.size < batchSize) {
    const pending = await prisma.notification.findMany({
      where: { deliveryState: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: batchSize - ids.size,
      select: { id: true },
    })
    for (const row of pending) ids.add(row.id)
  }
  let processed = 0
  const startedAt = Date.now()
  for (const id of ids) {
    if (Date.now() - startedAt > 45000) break
    try {
      await deliverNotification(id, provider, startedAt + 45000)
      processed += 1
    } catch {
      pushLog('worker_failed', { notificationId: id, category: 'storage' })
    }
  }
  return { checked: ids.size, processed }
}

export async function notifyPaymentConfirmedPush(bookingId: string, paymentId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, status: true },
  })
  if (!booking?.userId) return null
  return createNotificationEvent({
    userId: booking.userId,
    appType: 'customer',
    type: 'payment.confirmed',
    payload: { type: 'payment.confirmed', version: 1, bookingId, paymentId },
    dedupeKey: `payment.confirmed:${paymentId}`,
  })
}

export async function notifyPaymentFailedPush(bookingId: string, paymentId?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true },
  })
  if (!booking?.userId) return null
  return createNotificationEvent({
    userId: booking.userId,
    appType: 'customer',
    type: 'payment.failed',
    payload: { type: 'payment.failed', version: 1, bookingId, paymentId },
    dedupeKey: `payment.failed:${paymentId ?? bookingId}`,
  })
}

export async function notifyPaymentResolutionPush(input: {
  paymentResolutionId: string
  bookingId: string
  paymentId: string
  customerId: string
  status: string
}) {
  const typeByStatus: Partial<Record<string, NotificationType>> = {
    under_review: 'payment_resolution.under_review',
    approved: 'refund.approved',
    processing: 'refund.processing',
    completed: 'refund.completed',
    rejected: 'refund.rejected',
  }
  const type = typeByStatus[input.status]
  if (!type) return null

  return createNotificationEvent({
    userId: input.customerId,
    appType: 'customer',
    type,
    payload: {
      type,
      version: 1,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      paymentResolutionId: input.paymentResolutionId,
    },
    dedupeKey: `${type}:${input.paymentResolutionId}:${input.status}`,
  })
}

export async function notifyAssignmentPush({
  bookingLegId,
  previousDriverId,
}: {
  bookingLegId: string
  previousDriverId?: string | null
}) {
  const leg = await prisma.bookingLeg.findUnique({
    where: { id: bookingLegId },
    select: {
      id: true,
      bookingId: true,
      driverId: true,
      assignedAt: true,
      status: true,
      booking: { select: { userId: true } },
      driver: { select: { userId: true } },
    },
  })
  if (!leg) return

  const tasks: Array<Promise<unknown>> = []
  if (leg.driver?.userId) {
    tasks.push(
      createNotificationEvent({
        userId: leg.driver.userId,
        appType: 'driver',
        type: 'trip.driver_assigned',
        payload: {
          type: 'trip.driver_assigned',
          version: 1,
          bookingId: leg.bookingId,
          bookingLegId: leg.id,
        },
        dedupeKey: `trip.driver_assigned:${leg.id}:${leg.driverId}:${leg.assignedAt?.toISOString() ?? 'now'}`,
      })
    )
  }
  if (previousDriverId && previousDriverId !== leg.driverId) {
    const oldDriver = await prisma.driver.findUnique({
      where: { id: previousDriverId },
      select: { userId: true },
    })
    if (oldDriver?.userId) {
      tasks.push(
        createNotificationEvent({
          userId: oldDriver.userId,
          appType: 'driver',
          type: 'trip.assignment_removed',
          payload: {
            type: 'trip.assignment_removed',
            version: 1,
            bookingId: leg.bookingId,
            bookingLegId: leg.id,
          },
          dedupeKey: `trip.assignment_removed:${leg.id}:${previousDriverId}:${leg.driverId ?? 'none'}`,
        })
      )
    }
  }
  if (leg.booking.userId && (leg.driverId || previousDriverId)) {
    const customerType = leg.driverId ? 'trip.driver_assigned' : 'trip.assignment_changed'
    tasks.push(
      createNotificationEvent({
        userId: leg.booking.userId,
        appType: 'customer',
        type: customerType,
        payload: {
          type: customerType,
          version: 1,
          bookingId: leg.bookingId,
          bookingLegId: leg.id,
        },
        dedupeKey: `${customerType}:customer:${leg.id}:${leg.driverId ?? 'none'}:${leg.assignedAt?.toISOString() ?? 'none'}`,
      })
    )
  }

  await Promise.allSettled(tasks)
}

export async function notifyTripLifecyclePush({
  bookingId,
  bookingLegId,
  nextStatus,
  driverId,
}: {
  bookingId: string
  bookingLegId: string
  nextStatus: string
  driverId?: string | null
}) {
  const typeByStatus: Partial<Record<string, NotificationType>> = {
    driver_en_route: 'trip.driver_en_route',
    driver_arrived: 'trip.driver_arrived',
    in_progress: 'trip.started',
    completed: 'trip.completed',
    cancelled: 'trip.cancelled',
  }
  const type = typeByStatus[nextStatus]
  if (!type) return

  const leg = await prisma.bookingLeg.findUnique({
    where: { id: bookingLegId },
    select: {
      booking: { select: { userId: true } },
      driver: { select: { userId: true } },
    },
  })
  if (!leg) return

  const tasks: Array<Promise<unknown>> = []
  if (leg.booking.userId) {
    tasks.push(
      createNotificationEvent({
        userId: leg.booking.userId,
        appType: 'customer',
        type,
        payload: { type, version: 1, bookingId, bookingLegId },
        dedupeKey:
          nextStatus === 'cancelled'
            ? `${type}:${bookingId}`
            : `${type}:${bookingLegId}:${nextStatus}`,
      })
    )
  }
  if (
    (nextStatus === 'completed' || nextStatus === 'cancelled') &&
    (leg.driver?.userId || driverId)
  ) {
    const userId =
      leg.driver?.userId ??
      (
        await prisma.driver.findUnique({
          where: { id: driverId! },
          select: { userId: true },
        })
      )?.userId
    if (userId) {
      tasks.push(
        createNotificationEvent({
          userId,
          appType: 'driver',
          type,
          payload: { type, version: 1, bookingId, bookingLegId },
          dedupeKey: `${type}:driver:${bookingLegId}:${nextStatus}`,
        })
      )
    }
  }

  await Promise.allSettled(tasks)
}

export async function notifyBookingStatePush(bookingId: string, status: string) {
  if (status !== 'confirmed' && status !== 'cancelled') return null
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true, status: true },
    })
    if (!booking || booking.status !== status) return null
    const type = status === 'confirmed' ? 'booking.confirmed' : 'trip.cancelled'
    return createNotificationEvent({
      userId: booking.userId,
      appType: 'customer',
      type,
      payload: { type, version: 1, bookingId },
      dedupeKey: `${type}:${bookingId}`,
    })
  } catch {
    pushLog('event_failed', { category: 'storage' })
    return null
  }
}

export async function notifyTourBookingPush(
  tourBookingId: string,
  type: 'tour.booking_confirmed' | 'tour.payment_confirmed' | 'tour.cancelled',
  client = prisma
) {
  try {
    const booking = await client.tourBooking.findUnique({
      where: { id: tourBookingId },
      select: { userId: true, status: true, paymentStatus: true },
    })
    if (
      !booking ||
      (type === 'tour.cancelled'
        ? booking.status !== 'cancelled'
        : booking.paymentStatus !== 'paid')
    )
      return null
    return createNotificationEvent({
      userId: booking.userId,
      appType: 'customer',
      type,
      payload: { type, version: 1, tourBookingId },
      dedupeKey: `${type}:${tourBookingId}`,
    })
  } catch {
    pushLog('event_failed', { type, category: 'storage' })
    return null
  }
}

export async function notifyTourDayPush(
  day: {
    id: string
    tourBookingId: string
    updatedAt: Date | string
    tourBooking: { user: { id: string } }
  },
  event: string
) {
  return createNotificationEvent({
    userId: day.tourBooking.user.id,
    appType: 'customer',
    type: 'tour.status_updated',
    payload: { type: 'tour.status_updated', version: 1, tourBookingId: day.tourBookingId },
    dedupeKey: `tour.status_updated:${day.id}:${event}:${new Date(day.updatedAt).toISOString()}`,
  })
}
