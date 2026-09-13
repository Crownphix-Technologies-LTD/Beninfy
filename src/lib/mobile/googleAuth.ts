import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isAdminRole } from '@/lib/roles'
import { issueMobileTokens, type MobileDeviceInput } from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'

type GoogleTokenInfo = {
  iss?: string
  aud?: string
  exp?: string
  sub?: string
  email?: string
  email_verified?: string | boolean
  name?: string
  picture?: string
}

function configuredGoogleMobileClientIds() {
  const values = [
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    ...(process.env.GOOGLE_MOBILE_CLIENT_IDS ?? '').split(','),
  ]
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
}

function verifiedEmail(value: string | boolean | undefined) {
  return value === true || value === 'true'
}

export function googleMobileAuthConfig() {
  return {
    clientIds: configuredGoogleMobileClientIds(),
    tokenInfoUrl: 'https://oauth2.googleapis.com/tokeninfo',
  }
}

export async function verifyGoogleMobileIdToken(idToken: string) {
  const config = googleMobileAuthConfig()
  if (config.clientIds.length === 0) {
    return { ok: false as const, code: 'GOOGLE_AUTH_UNAVAILABLE' as MobileErrorCode }
  }

  const res = await fetch(`${config.tokenInfoUrl}?id_token=${encodeURIComponent(idToken)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  }).catch(() => null)
  if (!res?.ok) return { ok: false as const, code: 'GOOGLE_AUTH_INVALID' as MobileErrorCode }

  const payload = (await res.json().catch(() => null)) as GoogleTokenInfo | null
  const expiresAtSeconds = Number(payload?.exp)
  const issuerOk = payload?.iss === 'accounts.google.com' || payload?.iss === 'https://accounts.google.com'
  const audienceOk = Boolean(payload?.aud && config.clientIds.includes(payload.aud))
  const expiryOk = Number.isFinite(expiresAtSeconds) && expiresAtSeconds > Math.floor(Date.now() / 1000)
  const sub = payload?.sub?.trim()
  const email = payload?.email?.trim().toLowerCase()

  if (!issuerOk || !audienceOk || !expiryOk || !sub || !email || !verifiedEmail(payload?.email_verified)) {
    return { ok: false as const, code: 'GOOGLE_AUTH_INVALID' as MobileErrorCode }
  }

  return {
    ok: true as const,
    profile: {
      sub,
      email,
      name: payload?.name?.trim() || null,
      picture: payload?.picture?.trim() || null,
    },
  }
}

function customerAccountBlocked(user: {
  role: string
  disabledAt: Date | null
  deletionRequestedAt: Date | null
  anonymizedAt: Date | null
  driver: { id: string } | null
}) {
  if (isAdminRole(user.role) || user.role !== 'user' || user.driver) {
    return 'GOOGLE_ACCOUNT_CONFLICT' as const
  }
  if (user.anonymizedAt || user.deletionRequestedAt) return 'ACCOUNT_DELETION_PENDING' as const
  if (user.disabledAt) return 'ACCOUNT_DISABLED' as const
  return null
}

async function findOrCreateGoogleCustomer(input: {
  sub: string
  email: string
  name: string | null
  picture: string | null
}) {
  return prisma.$transaction(
    async (tx) => {
      const account = await tx.account.findUnique({
        where: { provider_providerAccountId: { provider: 'google', providerAccountId: input.sub } },
        include: { user: { include: { driver: true } } },
      })
      if (account) {
        const blocked = customerAccountBlocked(account.user)
        if (blocked) return { ok: false as const, code: blocked }
        return { ok: true as const, user: account.user }
      }

      const existingUser = await tx.user.findUnique({
        where: { email: input.email },
        include: { driver: true },
      })
      if (existingUser) {
        const blocked = customerAccountBlocked(existingUser)
        if (blocked) return { ok: false as const, code: blocked }
        await tx.account.create({
          data: {
            userId: existingUser.id,
            type: 'oauth',
            provider: 'google',
            providerAccountId: input.sub,
          },
        })
        return { ok: true as const, user: existingUser }
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          image: input.picture,
          emailVerified: new Date(),
          role: 'user',
          accounts: {
            create: {
              type: 'oauth',
              provider: 'google',
              providerAccountId: input.sub,
            },
          },
        },
        include: { driver: true },
      })
      return { ok: true as const, user }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}

export async function authenticateMobileGoogle(input: {
  idToken: string
  principalType: 'CUSTOMER'
  device: MobileDeviceInput
}) {
  const verified = await verifyGoogleMobileIdToken(input.idToken)
  if (!verified.ok) return verified

  try {
    const customer = await findOrCreateGoogleCustomer(verified.profile)
    if (!customer.ok) return customer
    return {
      ok: true as const,
      principalType: 'CUSTOMER' as const,
      ...(await issueMobileTokens({
        user: customer.user,
        principalType: 'CUSTOMER',
        device: input.device,
      })),
      user: customer.user,
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    ) {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider: 'google', providerAccountId: verified.profile.sub } },
        include: { user: { include: { driver: true } } },
      })
      if (account) {
        const blocked = customerAccountBlocked(account.user)
        if (blocked) return { ok: false as const, code: blocked }
        return {
          ok: true as const,
          principalType: 'CUSTOMER' as const,
          ...(await issueMobileTokens({
            user: account.user,
            principalType: 'CUSTOMER',
            device: input.device,
          })),
          user: account.user,
        }
      }
    }
    throw error
  }
}
