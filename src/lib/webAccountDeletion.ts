import { randomInt, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { hashOtpCode, verifyOtpCode } from '@/lib/mobile/onboarding'
import { scheduleCustomerAccountDeletion } from '@/lib/accountDeletion'

export const WEB_DELETION_PURPOSE = 'customer_web_account_deletion'
export const WEB_DELETION_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5

export function deletionVerificationEmail(code: string, locale: 'en' | 'fr') {
  const fr = locale === 'fr'
  const subject = fr
    ? 'Beninfy — Confirmez votre demande de suppression'
    : 'Beninfy — Verify your deletion request'
  const text = fr
    ? `Votre code de vérification Beninfy est : ${code}\n\nIl expire dans 10 minutes. Saisissez-le sur la page de suppression du compte Beninfy, puis confirmez votre demande. Ce code ne supprime pas votre compte à lui seul.\n\nSi vous n’avez pas fait cette demande, ignorez ce message. Ne partagez pas ce code. Assistance : support@beninfy.com`
    : `Your Beninfy verification code is: ${code}\n\nIt expires in 10 minutes. Enter it on the Beninfy account-deletion page, then confirm your request. This code alone does not delete your account.\n\nIf you did not request this, ignore this message. Do not share this code. Support: support@beninfy.com`
  // Only a server-generated numeric code is interpolated, never user-supplied HTML.
  return {
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#321339"><h1>Beninfy</h1><p style="white-space:pre-line">${text}</p></div>`,
  }
}

// Runs AFTER the generic HTTP response. Account existence and SMTP latency cannot
// affect the response status/body or its timing. No raw emails/codes are logged.
export async function sendWebDeletionChallenge(input: {
  requestId: string
  email: string
  locale: 'en' | 'fr'
}) {
  const user = await prisma.user.findFirst({
    where: {
      email: { equals: input.email, mode: 'insensitive' },
      role: 'user',
      anonymizedAt: null,
      driver: null,
    },
    select: { id: true },
  })
  if (!user) return
  const code = randomInt(0, 100000000).toString().padStart(8, '0')
  const now = new Date()
  const target = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`
    const current = await tx.user.findUnique({
      where: { id: user.id },
      include: { driver: { select: { id: true } } },
    })
    if (
      !current?.email ||
      current.email.toLowerCase() !== input.email ||
      current.role !== 'user' ||
      current.driver ||
      current.anonymizedAt
    )
      return null
    await tx.otpChallenge.updateMany({
      where: {
        userId: user.id,
        purpose: WEB_DELETION_PURPOSE,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    })
    await tx.otpChallenge.create({
      data: {
        id: input.requestId,
        userId: user.id,
        purpose: WEB_DELETION_PURPOSE,
        target: current.email,
        targetNormalized: input.email,
        codeHash: hashOtpCode({
          userId: user.id,
          targetNormalized: input.email,
          purpose: WEB_DELETION_PURPOSE,
          code,
        }),
        maxAttempts: MAX_ATTEMPTS,
        expiresAt: new Date(now.getTime() + WEB_DELETION_TTL_MS),
        resendAvailableAt: new Date(now.getTime() + 60000),
      },
    })
    return current.email
  })
  if (!target) return
  try {
    await sendEmail({ to: target, ...deletionVerificationEmail(code, input.locale) })
  } catch {
    await prisma.otpChallenge.updateMany({
      where: { id: input.requestId, consumedAt: null },
      data: { invalidatedAt: new Date() },
    })
    // Provider exceptions may contain credentials or recipient addresses.
    console.warn('account_deletion.email_unavailable')
  }
}

export function newDeletionRequestId() {
  return randomUUID()
}

export async function confirmWebAccountDeletion(requestId: string, code: string) {
  const candidate = await prisma.otpChallenge.findFirst({
    where: { id: requestId, purpose: WEB_DELETION_PURPOSE },
    select: { userId: true },
  })
  if (!candidate) return null
  return prisma.$transaction(async (tx) => {
    // Use the same lock order as issuance: user first, challenge second.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM "OtpChallenge" WHERE id = ${requestId} FOR UPDATE`
    const challenge = await tx.otpChallenge.findUnique({ where: { id: requestId } })
    const now = new Date()
    if (
      !challenge ||
      challenge.purpose !== WEB_DELETION_PURPOSE ||
      challenge.consumedAt ||
      challenge.invalidatedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= challenge.maxAttempts
    )
      return null
    const valid = verifyOtpCode({
      expectedHash: challenge.codeHash,
      userId: candidate.userId,
      targetNormalized: challenge.targetNormalized,
      purpose: WEB_DELETION_PURPOSE,
      code,
    })
    if (!valid) {
      await tx.otpChallenge.update({
        where: { id: requestId },
        data: {
          attempts: { increment: 1 },
          invalidatedAt: challenge.attempts + 1 >= challenge.maxAttempts ? now : null,
        },
      })
      return null
    }
    const user = await tx.user.findUnique({
      where: { id: candidate.userId },
      include: { driver: { select: { id: true } } },
    })
    if (
      !user?.email ||
      user.role !== 'user' ||
      user.driver ||
      user.anonymizedAt ||
      user.email.toLowerCase() !== challenge.targetNormalized
    )
      return null
    const deletion = await scheduleCustomerAccountDeletion(tx, user.id, {
      channel: 'public_web',
      verification: 'email_otp',
    })
    if (!deletion) return null
    await tx.otpChallenge.update({ where: { id: requestId }, data: { consumedAt: now } })
    return deletion
  })
}
