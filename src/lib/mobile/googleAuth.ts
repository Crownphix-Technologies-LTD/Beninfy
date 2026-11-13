import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { isAdminRole } from '@/lib/roles'
import {
  issueMobileTokens,
  type MobileDeviceInput,
  type MobilePrincipal,
} from '@/lib/mobile/auth'
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

const GOOGLE_LINK_CHALLENGE_TTL_SECONDS = 5 * 60
const GOOGLE_LINK_CHALLENGE_MAX_ATTEMPTS = 5
const GOOGLE_LINK_ISSUANCE_WINDOW_MS = 15 * 60 * 1000
const GOOGLE_LINK_ISSUANCE_LIMIT = 5
const GOOGLE_LINK_PROOF_WINDOW_MS = 15 * 60 * 1000

function googleLinkChallengeHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function isGoogleLinkSerializationFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as {
    code?: unknown
    meta?: {
      code?: unknown
      driverAdapterError?: { cause?: { originalCode?: unknown } }
    }
  }
  return (
    candidate.code === 'P2034' ||
    candidate.code === '40001' ||
    candidate.meta?.code === '40001' ||
    candidate.meta?.driverAdapterError?.cause?.originalCode === '40001'
  )
}

export function googleLinkChallengePolicy() {
  return {
    expiresIn: GOOGLE_LINK_CHALLENGE_TTL_SECONDS,
    maxAttempts: GOOGLE_LINK_CHALLENGE_MAX_ATTEMPTS,
  }
}

async function issueGoogleLinkChallenge(input: {
  userId: string
  providerAccountId: string
  device: MobileDeviceInput
}) {
  const token = randomBytes(32).toString('base64url')
  const policy = googleLinkChallengePolicy()
  const expiresAt = new Date(Date.now() + policy.expiresIn * 1000)

  const issued = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`
    const recentChallenges = await tx.customerIdentityLinkChallenge.count({
      where: {
        userId: input.userId,
        provider: 'google',
        createdAt: { gte: new Date(Date.now() - GOOGLE_LINK_ISSUANCE_WINDOW_MS) },
      },
    })
    if (recentChallenges >= GOOGLE_LINK_ISSUANCE_LIMIT) return false

    await tx.customerIdentityLinkChallenge.create({
      data: {
        tokenHash: googleLinkChallengeHash(token),
        userId: input.userId,
        provider: 'google',
        providerAccountId: input.providerAccountId,
        expiresAt,
        maxAttempts: policy.maxAttempts,
        installationId: input.device.deviceId?.slice(0, 120) || null,
        platform: input.device.platform?.slice(0, 40) || null,
      },
    })
    return true
  })

  return issued
    ? { ok: true as const, token, expiresAt, expiresIn: policy.expiresIn }
    : { ok: false as const, code: 'RATE_LIMITED' as const }
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

export function customerGoogleAccountBlock(user: {
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

export function googleLinkRelationship(input: {
  targetUserId: string
  identityOwnerUserId: string | null
  targetHasGoogleIdentity: boolean
}) {
  if (input.identityOwnerUserId) {
    return input.identityOwnerUserId === input.targetUserId
      ? ('already_linked' as const)
      : ('conflict' as const)
  }
  return input.targetHasGoogleIdentity ? ('conflict' as const) : ('create' as const)
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
        const blocked = customerGoogleAccountBlock(account.user)
        if (blocked) return { ok: false as const, code: blocked }
        return { ok: true as const, user: account.user }
      }

      const existingUser = await tx.user.findFirst({
        where: { email: { equals: input.email, mode: 'insensitive' } },
        include: { driver: true, accounts: { where: { provider: 'google' }, select: { id: true } } },
      })
      if (existingUser) {
        const blocked = customerGoogleAccountBlock(existingUser)
        if (blocked) return { ok: false as const, code: blocked }
        if (!existingUser.hashedPassword || existingUser.accounts.length > 0) {
          return { ok: false as const, code: 'GOOGLE_ACCOUNT_CONFLICT' as const }
        }
        return {
          ok: false as const,
          code: 'GOOGLE_LINK_REQUIRED' as const,
          linkTarget: { userId: existingUser.id, providerAccountId: input.sub },
        }
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
    if (!customer.ok) {
      if (customer.code !== 'GOOGLE_LINK_REQUIRED') return customer
      const challenge = await issueGoogleLinkChallenge({
        ...customer.linkTarget,
        device: input.device,
      })
      if (!challenge.ok) return challenge
      return {
        ok: false as const,
        code: customer.code,
        linkingChallenge: challenge,
      }
    }
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
        const blocked = customerGoogleAccountBlock(account.user)
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

export async function completeGoogleLinkChallenge(input: {
  challengeToken: string
  currentPassword: string
  device: MobileDeviceInput
  issueTokens?: typeof issueMobileTokens
}) {
  const tokenHash = googleLinkChallengeHash(input.challengeToken)
  const issueTokens = input.issueTokens ?? issueMobileTokens

  const runTransaction = () => prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "CustomerIdentityLinkChallenge"
        WHERE "tokenHash" = ${tokenHash}
        FOR UPDATE
      `
      const challengeId = locked[0]?.id
      if (!challengeId) {
        return { ok: false as const, code: 'GOOGLE_LINK_CHALLENGE_INVALID' as const }
      }

      const challenge = await tx.customerIdentityLinkChallenge.findUniqueOrThrow({
        where: { id: challengeId },
      })
      if (challenge.consumedAt) {
        return { ok: false as const, code: 'GOOGLE_LINK_CHALLENGE_INVALID' as const }
      }
      if (challenge.expiresAt <= new Date()) {
        await tx.customerIdentityLinkChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        })
        return { ok: false as const, code: 'GOOGLE_LINK_CHALLENGE_EXPIRED' as const }
      }
      if (challenge.failedAttempts >= challenge.maxAttempts) {
        await tx.customerIdentityLinkChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        })
        return { ok: false as const, code: 'GOOGLE_LINK_ATTEMPTS_EXCEEDED' as const }
      }

      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${challenge.userId} FOR UPDATE`
      const customer = await tx.user.findUnique({
        where: { id: challenge.userId },
        include: { driver: true },
      })
      if (!customer) {
        return { ok: false as const, code: 'GOOGLE_LINK_CHALLENGE_INVALID' as const }
      }
      const blocked = customerGoogleAccountBlock(customer)
      if (blocked) return { ok: false as const, code: blocked }
      if (!customer.hashedPassword) {
        return { ok: false as const, code: 'ACCOUNT_REAUTH_REQUIRED' as const }
      }

      const recentProofFailures = await tx.customerIdentityLinkChallenge.aggregate({
        where: {
          userId: customer.id,
          provider: challenge.provider,
          createdAt: { gte: new Date(Date.now() - GOOGLE_LINK_PROOF_WINDOW_MS) },
        },
        _sum: { failedAttempts: true },
      })
      const customerFailedAttempts = recentProofFailures._sum.failedAttempts ?? 0
      if (customerFailedAttempts >= challenge.maxAttempts) {
        await tx.customerIdentityLinkChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        })
        return { ok: false as const, code: 'GOOGLE_LINK_ATTEMPTS_EXCEEDED' as const }
      }

      const passwordValid = await bcrypt.compare(input.currentPassword, customer.hashedPassword)
      if (!passwordValid) {
        const failedAttempts = challenge.failedAttempts + 1
        const exhausted =
          failedAttempts >= challenge.maxAttempts ||
          customerFailedAttempts + 1 >= challenge.maxAttempts
        await tx.customerIdentityLinkChallenge.update({
          where: { id: challenge.id },
          data: {
            failedAttempts,
            ...(exhausted ? { consumedAt: new Date() } : {}),
          },
        })
        return {
          ok: false as const,
          code: exhausted
            ? ('GOOGLE_LINK_ATTEMPTS_EXCEEDED' as const)
            : ('GOOGLE_LINK_PROOF_INVALID' as const),
        }
      }

      const accountForIdentity = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: challenge.provider,
            providerAccountId: challenge.providerAccountId,
          },
        },
      })
      const existingGoogle = await tx.account.findFirst({
        where: { userId: customer.id, provider: challenge.provider },
        select: { id: true },
      })
      const relationship = googleLinkRelationship({
        targetUserId: customer.id,
        identityOwnerUserId: accountForIdentity?.userId ?? null,
        targetHasGoogleIdentity: Boolean(existingGoogle),
      })
      if (relationship === 'conflict') {
        await tx.customerIdentityLinkChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        })
        return { ok: false as const, code: 'GOOGLE_ACCOUNT_CONFLICT' as const }
      }
      if (relationship === 'create') {
        await tx.account.create({
          data: {
            userId: customer.id,
            type: 'oauth',
            provider: challenge.provider,
            providerAccountId: challenge.providerAccountId,
          },
        })
      }
      await tx.customerIdentityLinkChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      })
      return {
        ok: true as const,
        alreadyLinked: relationship === 'already_linked',
        user: customer,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )

  let linked: Awaited<ReturnType<typeof runTransaction>> | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      linked = await runTransaction()
      break
    } catch (error) {
      if (!isGoogleLinkSerializationFailure(error) || attempt === 2) throw error
    }
  }
  if (!linked) throw new Error('Google link transaction did not complete')

  if (!linked.ok) return linked
  return {
    ...linked,
    principalType: 'CUSTOMER' as const,
    ...(await issueTokens({
      user: linked.user,
      principalType: 'CUSTOMER',
      device: input.device,
    })),
  }
}

export async function linkGoogleToCustomer(input: {
  principal: MobilePrincipal
  idToken: string
  currentPassword: string
}) {
  const verified = await verifyGoogleMobileIdToken(input.idToken)
  if (!verified.ok) return verified

  const customer = await prisma.user.findUnique({
    where: { id: input.principal.userId },
    include: { driver: true },
  })
  if (!customer) return { ok: false as const, code: 'UNAUTHENTICATED' as const }

  const blocked = customerGoogleAccountBlock(customer)
  if (blocked) return { ok: false as const, code: blocked }
  if (!customer.email || customer.email.trim().toLowerCase() !== verified.profile.email) {
    return { ok: false as const, code: 'GOOGLE_ACCOUNT_CONFLICT' as const }
  }
  if (!customer.hashedPassword) {
    return { ok: false as const, code: 'ACCOUNT_REAUTH_REQUIRED' as const }
  }
  if (!(await bcrypt.compare(input.currentPassword, customer.hashedPassword))) {
    return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as const }
  }

  try {
    const linked = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${customer.id} FOR UPDATE`

        const accountForIdentity = await tx.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: 'google',
              providerAccountId: verified.profile.sub,
            },
          },
        })
        const existingGoogle = await tx.account.findFirst({
          where: { userId: customer.id, provider: 'google' },
          select: { id: true },
        })

        const relationship = googleLinkRelationship({
          targetUserId: customer.id,
          identityOwnerUserId: accountForIdentity?.userId ?? null,
          targetHasGoogleIdentity: Boolean(existingGoogle),
        })
        if (relationship === 'already_linked') {
          return { ok: true as const, alreadyLinked: true }
        }
        if (relationship === 'conflict') {
          return { ok: false as const, code: 'GOOGLE_ACCOUNT_CONFLICT' as const }
        }

        await tx.account.create({
          data: {
            userId: customer.id,
            type: 'oauth',
            provider: 'google',
            providerAccountId: verified.profile.sub,
          },
        })
        return { ok: true as const, alreadyLinked: false }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    if (!linked.ok) return linked
    return { ok: true as const, alreadyLinked: linked.alreadyLinked, user: customer }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const account = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: verified.profile.sub,
          },
        },
      })
      if (account?.userId === customer.id) {
        return { ok: true as const, alreadyLinked: true, user: customer }
      }
      return { ok: false as const, code: 'GOOGLE_ACCOUNT_CONFLICT' as const }
    }
    throw error
  }
}
