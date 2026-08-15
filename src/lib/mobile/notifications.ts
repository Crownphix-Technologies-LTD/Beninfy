import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import { prisma } from '@/lib/prisma'

export type PushAppType = 'customer' | 'driver'
export type PushPlatform = 'android' | 'ios'
export type NotificationLanguage = 'en' | 'fr'
export type NotificationDeliveryState =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'invalid_token'
  | 'skipped'
  | 'skipped_no_device'

export type NotificationType =
  | 'booking.confirmed'
  | 'payment.confirmed'
  | 'payment.failed'
  | 'trip.driver_assigned'
  | 'trip.assignment_removed'
  | 'trip.assignment_changed'
  | 'trip.driver_en_route'
  | 'trip.driver_arrived'
  | 'trip.started'
  | 'trip.completed'
  | 'trip.cancelled'

type PushPayload = {
  type: NotificationType
  version: 1
  bookingId?: string
  bookingLegId?: string
  paymentId?: string
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
  NotificationType,
  Record<NotificationLanguage, { title: string; body: string }>
> = {
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

export function templateFor(type: NotificationType, language: NotificationLanguage) {
  return templates[type]?.[language] ?? templates[type]?.en
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

  if (provider === 'mock') {
    return {
      name: 'mock',
      async send() {
        return { ok: true, providerMessageId: `mock-${Date.now()}` }
      },
    }
  }

  return {
    name: provider === 'fcm' ? 'fcm-disabled' : 'disabled',
    async send() {
      return {
        ok: false,
        classification: 'configuration',
        errorCode: 'PUSH_PROVIDER_NOT_CONFIGURED',
      }
    },
  }
}

export async function registerPushDevice({
  principal,
  input,
}: {
  principal: MobilePrincipal
  input: {
    token: string
    platform: PushPlatform
    appType: PushAppType
    deviceId?: string | null
    deviceName?: string | null
    appVersion?: string | null
    language?: string | null
  }
}) {
  if (!principalOwnsAppType(principal, input.appType)) {
    return { ok: false as const, code: 'FORBIDDEN' as const }
  }

  const now = new Date()
  const cleanToken = input.token.trim()
  const cleanDeviceId = input.deviceId?.trim().slice(0, 120) || null
  const data = {
    userId: principal.userId,
    appType: input.appType,
    principalType: principal.type.toLowerCase(),
    platform: input.platform,
    token: cleanToken,
    tokenHash: tokenHash(cleanToken),
    deviceId: cleanDeviceId,
    deviceName: input.deviceName?.trim().slice(0, 120) || null,
    appVersion: input.appVersion?.trim().slice(0, 40) || null,
    language: normalizeNotificationLanguage(input.language),
    lastSeenAt: now,
    revokedAt: null,
    invalidatedAt: null,
  }

  const existingByDevice = cleanDeviceId
    ? await prisma.pushDevice.findUnique({
        where: {
          userId_appType_deviceId: {
            userId: principal.userId,
            appType: input.appType,
            deviceId: cleanDeviceId,
          },
        },
      })
    : null

  const device = existingByDevice
    ? await prisma.pushDevice.update({ where: { id: existingByDevice.id }, data })
    : await prisma.pushDevice.upsert({
        where: { appType_tokenHash: { appType: input.appType, tokenHash: data.tokenHash } },
        create: data,
        update: data,
      })

  console.info('Push device registered', {
    deviceId: device.id,
    userId: principal.userId,
    appType: input.appType,
    platform: input.platform,
  })

  return { ok: true as const, device }
}

export async function revokePushDevice({
  principal,
  appType,
  token,
  deviceId,
}: {
  principal: MobilePrincipal
  appType: PushAppType
  token?: string | null
  deviceId?: string | null
}) {
  if (!principalOwnsAppType(principal, appType)) {
    return { ok: false as const, code: 'FORBIDDEN' as const }
  }
  if (!token && !deviceId) return { ok: false as const, code: 'PUSH_TOKEN_NOT_FOUND' as const }

  const updated = await prisma.pushDevice.updateMany({
    where: {
      userId: principal.userId,
      appType,
      revokedAt: null,
      ...(token ? { tokenHash: tokenHash(token) } : {}),
      ...(deviceId ? { deviceId } : {}),
    },
    data: { revokedAt: new Date() },
  })

  return updated.count > 0
    ? { ok: true as const, revoked: updated.count }
    : { ok: false as const, code: 'PUSH_TOKEN_NOT_FOUND' as const }
}

async function resolveLanguage(
  userId: string,
  appType: PushAppType,
  fallback?: NotificationLanguage
) {
  const device = await prisma.pushDevice.findFirst({
    where: { userId, appType, revokedAt: null, invalidatedAt: null },
    orderBy: { lastSeenAt: 'desc' },
    select: { language: true },
  })
  return normalizeNotificationLanguage(device?.language ?? fallback)
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
  const resolvedLanguage = await resolveLanguage(userId, appType, language)
  const template = templateFor(type, resolvedLanguage) ?? templateFor(type, 'en')
  if (!template) return null

  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        appType,
        type,
        language: resolvedLanguage,
        title: template.title,
        body: template.body,
        payload: payload as Prisma.InputJsonValue,
        dedupeKey,
      },
    })

    console.info('Notification event created', {
      notificationId: notification.id,
      type,
      userId,
      appType,
    })

    deliverNotification(notification.id).catch((error) => {
      console.warn('Notification delivery failed after event creation', {
        notificationId: notification.id,
        type,
        error: error instanceof Error ? error.message : 'unknown',
      })
    })

    return notification
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.notification.findUnique({ where: { dedupeKey } })
    }
    throw error
  }
}

export async function deliverNotification(notificationId: string, provider = getPushProvider()) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } })
  if (!notification) return null

  const devices = await prisma.pushDevice.findMany({
    where: {
      userId: notification.userId,
      appType: notification.appType,
      revokedAt: null,
      invalidatedAt: null,
    },
  })

  if (devices.length === 0) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { deliveryState: 'skipped_no_device' },
    })
    console.info('Notification delivery skipped: no active device', {
      notificationId: notification.id,
      userId: notification.userId,
      appType: notification.appType,
    })
    return { state: 'skipped_no_device' as const }
  }

  let sent = 0
  let invalid = 0
  let failed = 0
  let skipped = 0

  for (const device of devices) {
    const existingDelivery = await prisma.notificationDelivery.findUnique({
      where: {
        notificationId_pushDeviceId: {
          notificationId: notification.id,
          pushDeviceId: device.id,
        },
      },
    })
    if (existingDelivery?.status === 'sent' || existingDelivery?.status === 'invalid_token') {
      if (existingDelivery.status === 'sent') sent += 1
      if (existingDelivery.status === 'invalid_token') invalid += 1
      continue
    }
    if ((existingDelivery?.attempts ?? 0) >= MAX_RETRY_ATTEMPTS) {
      skipped += 1
      continue
    }

    const result = await provider.send({
      token: device.token,
      title: notification.title,
      body: notification.body,
      data: pushPayloadToData(notification.payload as PushPayload),
    })
    const now = new Date()

    if (result.ok) {
      sent += 1
      await prisma.notificationDelivery.upsert({
        where: {
          notificationId_pushDeviceId: {
            notificationId: notification.id,
            pushDeviceId: device.id,
          },
        },
        create: {
          notificationId: notification.id,
          pushDeviceId: device.id,
          provider: provider.name,
          status: 'sent',
          attempts: 1,
          lastAttemptAt: now,
          providerMessageId: result.providerMessageId,
        },
        update: {
          provider: provider.name,
          status: 'sent',
          attempts: { increment: 1 },
          lastAttemptAt: now,
          providerMessageId: result.providerMessageId,
          errorCode: null,
        },
      })
      continue
    }

    const status =
      result.classification === 'invalid_token'
        ? 'invalid_token'
        : result.classification === 'configuration'
          ? 'skipped'
          : 'failed'
    if (status === 'invalid_token') invalid += 1
    else if (status === 'skipped') skipped += 1
    else failed += 1

    if (status === 'invalid_token') {
      await prisma.pushDevice.update({
        where: { id: device.id },
        data: { invalidatedAt: now },
      })
      console.warn('Push device invalidated', {
        deviceId: device.id,
        userId: device.userId,
        appType: device.appType,
        errorCode: result.errorCode,
      })
    }

    await prisma.notificationDelivery.upsert({
      where: {
        notificationId_pushDeviceId: {
          notificationId: notification.id,
          pushDeviceId: device.id,
        },
      },
      create: {
        notificationId: notification.id,
        pushDeviceId: device.id,
        provider: provider.name,
        status,
        attempts: 1,
        lastAttemptAt: now,
        nextAttemptAt: status === 'failed' ? new Date(now.getTime() + 5 * 60 * 1000) : null,
        errorCode: result.errorCode,
      },
      update: {
        provider: provider.name,
        status,
        attempts: { increment: 1 },
        lastAttemptAt: now,
        nextAttemptAt: status === 'failed' ? new Date(now.getTime() + 5 * 60 * 1000) : null,
        errorCode: result.errorCode,
      },
    })
  }

  const deliveryState: NotificationDeliveryState =
    sent > 0
      ? 'sent'
      : invalid > 0 && failed === 0
        ? 'invalid_token'
        : failed > 0
          ? 'failed'
          : skipped > 0
            ? 'skipped'
            : 'pending'

  await prisma.notification.update({
    where: { id: notification.id },
    data: { deliveryState },
  })

  console.info('Notification delivery attempted', {
    notificationId: notification.id,
    provider: provider.name,
    deliveryState,
    sent,
    invalid,
    failed,
    skipped,
  })

  return { state: deliveryState, sent, invalid, failed, skipped }
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
    tasks.push(
      createNotificationEvent({
        userId: leg.booking.userId,
        appType: 'customer',
        type: 'trip.assignment_changed',
        payload: {
          type: 'trip.assignment_changed',
          version: 1,
          bookingId: leg.bookingId,
          bookingLegId: leg.id,
        },
        dedupeKey: `trip.assignment_changed:${leg.id}:${leg.driverId ?? 'none'}`,
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
        dedupeKey: `${type}:${bookingLegId}:${nextStatus}`,
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
