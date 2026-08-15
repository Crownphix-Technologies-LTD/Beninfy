import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import type { Driver, User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isAdminRole } from '@/lib/roles'

export type MobilePrincipalType = 'CUSTOMER' | 'DRIVER'

export type MobileDeviceInput = {
  deviceId?: string | null
  platform?: string | null
  deviceName?: string | null
  appVersion?: string | null
}

export type MobilePrincipal = {
  type: MobilePrincipalType
  userId: string
  email: string
  role: string
  sessionId: string
  driverId?: string
}

type AccessTokenPayload = {
  sub: string
  typ: MobilePrincipalType
  role: string
  ver: number
  sid: string
  driverId?: string
  exp: number
}

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.MOBILE_ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60)
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.MOBILE_REFRESH_TOKEN_TTL_DAYS ?? 30)

function authSecret() {
  const secret = process.env.MOBILE_AUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) throw new Error('MOBILE_AUTH_SECRET or AUTH_SECRET is required for mobile auth')
  return secret
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string) {
  return createHmac('sha256', authSecret()).update(data).digest('base64url')
}

function refreshTokenHash(token: string) {
  return createHash('sha256').update(`${authSecret()}:${token}`).digest('hex')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function createAccessToken(payload: Omit<AccessTokenPayload, 'exp'>) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
    })
  )
  const signature = sign(`${header}.${body}`)
  return `${header}.${body}.${signature}`
}

function verifyAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  if (!safeEqual(sign(`${header}.${body}`), signature)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as AccessTokenPayload
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function cleanDevice(input: MobileDeviceInput) {
  return {
    deviceId: input.deviceId?.slice(0, 120) || null,
    platform: input.platform?.slice(0, 40) || null,
    deviceName: input.deviceName?.slice(0, 120) || null,
    appVersion: input.appVersion?.slice(0, 40) || null,
  }
}

function resolvePrincipal(
  user: User & { driver: Driver | null },
  requestedType?: MobilePrincipalType
) {
  if (user.disabledAt) return { error: 'ACCOUNT_DISABLED' as const }
  if (isAdminRole(user.role)) return { error: 'FORBIDDEN' as const }

  const canBeDriver = user.role === 'driver' || Boolean(user.driver)
  if (requestedType === 'DRIVER' || user.role === 'driver') {
    if (!user.driver) return { error: 'DRIVER_NOT_LINKED' as const }
    if (user.driver.status === 'inactive') return { error: 'DRIVER_INACTIVE' as const }
    return { type: 'DRIVER' as const, driverId: user.driver.id }
  }

  if (canBeDriver && requestedType !== 'CUSTOMER') {
    if (!user.driver) return { error: 'DRIVER_NOT_LINKED' as const }
    if (user.driver.status === 'inactive') return { error: 'DRIVER_INACTIVE' as const }
    return { type: 'DRIVER' as const, driverId: user.driver.id }
  }

  if (user.role !== 'user') return { error: 'FORBIDDEN' as const }
  return { type: 'CUSTOMER' as const }
}

export async function authenticateMobileLogin({
  email,
  password,
  principalType,
  device,
}: {
  email: string
  password: string
  principalType?: MobilePrincipalType
  device: MobileDeviceInput
}) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { driver: true },
  })
  if (!user?.hashedPassword) return { ok: false as const, code: 'INVALID_CREDENTIALS' as const }
  const passwordOk = await bcrypt.compare(password, user.hashedPassword)
  if (!passwordOk) return { ok: false as const, code: 'INVALID_CREDENTIALS' as const }

  const principal = resolvePrincipal(user, principalType)
  if ('error' in principal) return { ok: false as const, code: principal.error }

  return {
    ok: true as const,
    principalType: principal.type,
    driverId: principal.driverId,
    ...(await issueMobileTokens({
      user,
      principalType: principal.type,
      driverId: principal.driverId,
      device,
    })),
  }
}

export async function issueMobileTokens({
  user,
  principalType,
  driverId,
  device,
}: {
  user: User
  principalType: MobilePrincipalType
  driverId?: string
  device: MobileDeviceInput
}) {
  const refreshToken = randomBytes(48).toString('base64url')
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  const session = await prisma.mobileSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: refreshTokenHash(refreshToken),
      ...cleanDevice(device),
      expiresAt,
    },
  })
  const accessToken = createAccessToken({
    sub: user.id,
    typ: principalType,
    role: user.role,
    ver: user.sessionVersion,
    sid: session.id,
    driverId,
  })

  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer' as const,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  }
}

export async function refreshMobileTokens(refreshToken: string) {
  const tokenHash = refreshTokenHash(refreshToken)
  const session = await prisma.mobileSession.findUnique({
    where: { refreshTokenHash: tokenHash },
    include: { user: { include: { driver: true } } },
  })

  if (!session) return { ok: false as const, code: 'UNAUTHENTICATED' as const }
  if (session.revokedAt || session.expiresAt < new Date()) {
    if (!session.revokedAt) {
      await prisma.mobileSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      })
    }
    return { ok: false as const, code: 'UNAUTHENTICATED' as const }
  }

  const principal = resolvePrincipal(session.user)
  if ('error' in principal) {
    await prisma.mobileSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    })
    return { ok: false as const, code: principal.error }
  }

  const nextRefreshToken = randomBytes(48).toString('base64url')
  const rotated = await prisma.mobileSession.updateMany({
    where: {
      id: session.id,
      refreshTokenHash: tokenHash,
      revokedAt: null,
      expiresAt: { gte: new Date() },
    },
    data: {
      refreshTokenHash: refreshTokenHash(nextRefreshToken),
      lastUsedAt: new Date(),
    },
  })
  if (rotated.count !== 1) return { ok: false as const, code: 'UNAUTHENTICATED' as const }

  const accessToken = createAccessToken({
    sub: session.user.id,
    typ: principal.type,
    role: session.user.role,
    ver: session.user.sessionVersion,
    sid: session.id,
    driverId: principal.driverId,
  })

  return {
    ok: true as const,
    accessToken,
    refreshToken: nextRefreshToken,
    tokenType: 'Bearer' as const,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  }
}

export async function revokeMobileRefreshToken(refreshToken: string) {
  await prisma.mobileSession.updateMany({
    where: { refreshTokenHash: refreshTokenHash(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function requireMobilePrincipal(req: Request, expectedType?: MobilePrincipalType) {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return { ok: false as const, code: 'UNAUTHENTICATED' as const }
  const payload = verifyAccessToken(match[1])
  if (!payload) return { ok: false as const, code: 'UNAUTHENTICATED' as const }
  if (expectedType && payload.typ !== expectedType)
    return { ok: false as const, code: 'FORBIDDEN' as const }

  const session = await prisma.mobileSession.findUnique({
    where: { id: payload.sid },
    include: { user: { include: { driver: true } } },
  })
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const }
  }
  if (session.user.sessionVersion !== payload.ver)
    return { ok: false as const, code: 'UNAUTHENTICATED' as const }

  const resolved = resolvePrincipal(session.user, payload.typ)
  if ('error' in resolved) return { ok: false as const, code: resolved.error }
  if (expectedType && resolved.type !== expectedType)
    return { ok: false as const, code: 'FORBIDDEN' as const }

  return {
    ok: true as const,
    principal: {
      type: resolved.type,
      userId: session.user.id,
      email: session.user.email ?? '',
      role: session.user.role,
      sessionId: session.id,
      driverId: resolved.driverId,
    } satisfies MobilePrincipal,
    user: session.user,
  }
}
