import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { MobilePrincipal } from '@/lib/mobile/auth'

export const customerPushTokenSchema = z
  .object({
    token: z.string().trim().min(20).max(4096).regex(/^\S+$/),
    platform: z.enum(['android', 'ios']),
    installationId: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9._:-]+$/),
    locale: z.string().trim().min(2).max(16).optional(),
  })
  .strict()

export function pushTokenHash(token: string) {
  return createHash('sha256').update(token.trim()).digest('hex')
}

// Log only explicit identifiers/categories. Never pass exception/provider text.
export function pushLog(
  event: string,
  fields: {
    userId?: string
    deviceId?: string
    notificationId?: string
    type?: string
    appType?: string
    status?: string
    category?: string
    count?: number
  }
) {
  console.info('push.' + event, fields)
}

export async function registerPushDevice({
  principal,
  input,
}: {
  principal: MobilePrincipal
  input: {
    token: string
    platform: 'android' | 'ios'
    appType: 'customer' | 'driver'
    deviceId?: string | null
    deviceName?: string | null
    appVersion?: string | null
    language?: string | null
  }
}) {
  if ((principal.type === 'CUSTOMER' ? 'customer' : 'driver') !== input.appType)
    return { ok: false as const, code: 'FORBIDDEN' as const }
  const token = input.token.trim()
  if (token.length < 20 || token.length > 4096 || /\s/.test(token))
    return { ok: false as const, code: 'PUSH_TOKEN_INVALID' as const }
  const deviceId = input.deviceId?.trim().slice(0, 120) || null
  const hash = pushTokenHash(token)
  const language = input.language?.trim().toLowerCase().split('-')[0] === 'fr' ? 'fr' : 'en'
  try {
    const device = await prisma.$transaction(
      async (tx) => {
        // Lock stable registration keys before reconciling token refresh / account switch.
        const keys = [
          'token:' + hash,
          ...(deviceId ? ['installation:' + input.appType + ':' + deviceId] : []),
        ].sort()
        for (const key of keys)
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`
        await tx.$queryRaw`SELECT id FROM "MobileSession" WHERE id = ${principal.sessionId} FOR UPDATE`
        const session = await tx.mobileSession.findFirst({
          where: {
            id: principal.sessionId,
            userId: principal.userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        })
        if (!session) return null
        const tokenRow = await tx.pushDevice.findUnique({
          where: { appType_tokenHash: { appType: input.appType, tokenHash: hash } },
        })
        const installRow = deviceId
          ? await tx.pushDevice.findUnique({
              where: {
                userId_appType_deviceId: {
                  userId: principal.userId,
                  appType: input.appType,
                  deviceId,
                },
              },
            })
          : null
        // Keep one canonical row. A refresh may collide with a token registered before installation identity was available.
        if (tokenRow && installRow && tokenRow.id !== installRow.id)
          await tx.pushDevice.delete({ where: { id: installRow.id } })
        const existing = tokenRow ?? installRow
        await tx.pushDevice.updateMany({
          where: {
            ...(existing ? { id: { not: existing.id } } : {}),
            OR: [{ tokenHash: hash }, ...(deviceId ? [{ appType: input.appType, deviceId }] : [])],
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        })
        const data = {
          userId: principal.userId,
          sessionId: principal.sessionId,
          appType: input.appType,
          principalType: principal.type.toLowerCase(),
          platform: input.platform,
          token,
          tokenHash: hash,
          deviceId,
          deviceName: input.deviceName?.slice(0, 120) || null,
          appVersion: input.appVersion?.slice(0, 40) || null,
          language,
          lastSeenAt: new Date(),
          revokedAt: null,
          invalidatedAt: null,
        }
        return existing
          ? tx.pushDevice.update({ where: { id: existing.id }, data })
          : tx.pushDevice.create({ data })
      },
      { timeout: 15000, maxWait: 15000 }
    )
    if (!device) {
      pushLog('registration_failed', { userId: principal.userId, category: 'session_inactive' })
      return { ok: false as const, code: 'UNAUTHENTICATED' as const }
    }
    pushLog('registered', { userId: principal.userId, deviceId: device.id, appType: input.appType })
    return { ok: true as const, device }
  } catch {
    pushLog('registration_failed', { userId: principal.userId, category: 'storage' })
    return { ok: false as const, code: 'INTERNAL_ERROR' as const }
  }
}

export async function revokePushDevice({
  principal,
  appType,
  token,
  deviceId,
}: {
  principal: MobilePrincipal
  appType: 'customer' | 'driver'
  token?: string | null
  deviceId?: string | null
}) {
  if ((principal.type === 'CUSTOMER' ? 'customer' : 'driver') !== appType)
    return { ok: false as const, code: 'FORBIDDEN' as const }
  if (!token && !deviceId) return { ok: false as const, code: 'PUSH_TOKEN_NOT_FOUND' as const }
  try {
    const result = await prisma.pushDevice.updateMany({
      where: {
        userId: principal.userId,
        appType,
        revokedAt: null,
        ...(token ? { tokenHash: pushTokenHash(token) } : {}),
        ...(deviceId ? { deviceId } : {}),
      },
      data: { revokedAt: new Date() },
    })
    pushLog('revoked', { userId: principal.userId, appType, count: result.count })
    // Same result for missing, previously revoked, and another user's installation.
    return { ok: true as const, revoked: result.count }
  } catch {
    pushLog('revocation_failed', { userId: principal.userId, appType, category: 'storage' })
    return { ok: false as const, code: 'INTERNAL_ERROR' as const }
  }
}
