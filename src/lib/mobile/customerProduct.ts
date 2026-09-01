import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notifyMobileEmailOtp } from '@/lib/notifications'
import { deleteStorageImageByPublicUrl, uploadAvatarImage } from '@/lib/supabaseStorage'
import {
  generateOtpCode,
  hashOtpCode,
  normalizeMobileLocale,
  verifyOtpCode,
  validateMobilePassword,
} from '@/lib/mobile/onboarding'
import { issueMobileTokens, type MobileDeviceInput, type MobilePrincipal } from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'

export const SAVED_PLACE_TYPES = ['home', 'work', 'custom'] as const
export const REVIEW_TAGS = [
  'professional_driver',
  'clean_vehicle',
  'on_time',
  'smooth_border_crossing',
  'safe_trip',
  'good_communication',
  'needs_improvement',
] as const
export const PAYMENT_RESOLUTION_STATUSES = [
  'review_required',
  'requested',
  'under_review',
  'approved',
  'processing',
  'completed',
  'rejected',
] as const

const EMAIL_CHANGE_PURPOSE = 'customer_email_change'
const OTP_TTL_MS = Number(process.env.MOBILE_EMAIL_OTP_TTL_MS ?? 10 * 60 * 1000)
const OTP_RESEND_COOLDOWN_MS = Number(process.env.MOBILE_EMAIL_OTP_RESEND_COOLDOWN_MS ?? 60 * 1000)
const OTP_MAX_ATTEMPTS = Number(process.env.MOBILE_EMAIL_OTP_MAX_ATTEMPTS ?? 5)
const ACCOUNT_DELETE_CONFIRMATION = 'DELETE_MY_ACCOUNT'
const ACCOUNT_DELETION_GRACE_DAYS = Number(process.env.ACCOUNT_DELETION_GRACE_DAYS ?? 30)
const ACCOUNT_DELETION_RECENT_SESSION_SECONDS = Number(
  process.env.ACCOUNT_DELETION_RECENT_SESSION_SECONDS ?? 15 * 60
)

type Dateish = Date | string

function iso(value: Dateish | null | undefined) {
  return value ? new Date(value).toISOString() : null
}

function displayReference(id: string) {
  return `BFY-${id.slice(-8).toUpperCase()}`
}

export function validCoordinates(latitude?: number | null, longitude?: number | null) {
  if (latitude == null && longitude == null) return true
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

export function toSavedPlaceDto(place: {
  id: string
  type: string
  label: string | null
  address: string
  latitude: number | null
  longitude: number | null
  country: string | null
  city: string | null
  providerPlaceId: string | null
  createdAt: Dateish
  updatedAt: Dateish
}) {
  return {
    id: place.id,
    type: place.type,
    label: place.label,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    country: place.country,
    city: place.city,
    providerPlaceId: place.providerPlaceId,
    createdAt: iso(place.createdAt),
    updatedAt: iso(place.updatedAt),
  }
}

export function toTravelPreferenceDto(
  preference: {
    preferredVehicleId: string | null
    defaultPassengers: number | null
    defaultPickupInstructions: string | null
    createdAt?: Dateish
    updatedAt?: Dateish
  } | null
) {
  return {
    preferredVehicleId: preference?.preferredVehicleId ?? null,
    defaultPassengers: preference?.defaultPassengers ?? null,
    defaultPickupInstructions: preference?.defaultPickupInstructions ?? null,
    createdAt: iso(preference?.createdAt),
    updatedAt: iso(preference?.updatedAt),
  }
}

export function toTripReviewDto(review: {
  id: string
  bookingLegId: string
  customerId: string
  driverId: string
  rating: number
  tags: string[]
  comment: string | null
  createdAt: Dateish
  updatedAt: Dateish
}) {
  return {
    id: review.id,
    bookingLegId: review.bookingLegId,
    customerId: review.customerId,
    driverId: review.driverId,
    rating: review.rating,
    tags: review.tags,
    comment: review.comment,
    createdAt: iso(review.createdAt),
    updatedAt: iso(review.updatedAt),
  }
}

export function toPaymentHistoryDto(payment: {
  id: string
  bookingId: string
  amountNGN: number
  status: string
  reference: string
  provider: string
  providerReference: string | null
  currencyCode: string
  checkoutAmount: number | null
  paidAt: Dateish | null
  failureCode: string | null
  createdAt: Dateish
  updatedAt: Dateish
  booking: {
    id: string
    from: string
    to: string
    date: Dateish
    returnDate: Dateish | null
    tripType: string
    status: string
  }
}) {
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    bookingReference: displayReference(payment.bookingId),
    reference: payment.reference,
    provider: payment.provider,
    providerReference: payment.providerReference,
    amountNGN: payment.amountNGN,
    currencyCode: payment.currencyCode,
    checkoutAmount: payment.checkoutAmount,
    status: payment.status,
    paidAt: iso(payment.paidAt),
    failureCode: payment.failureCode,
    createdAt: iso(payment.createdAt),
    updatedAt: iso(payment.updatedAt),
    booking: {
      id: payment.booking.id,
      reference: displayReference(payment.booking.id),
      from: payment.booking.from,
      to: payment.booking.to,
      date: iso(payment.booking.date),
      returnDate: iso(payment.booking.returnDate),
      tripType: payment.booking.tripType,
      status: payment.booking.status,
    },
  }
}

export function toPaymentResolutionDto(resolution: {
  id: string
  paymentId: string
  bookingId: string
  status: string
  reason: string
  amountNGN: number
  currencyCode: string
  provider: string
  customerMessageCode: string | null
  requestedAt: Dateish | null
  reviewedAt: Dateish | null
  approvedAt: Dateish | null
  processingAt: Dateish | null
  completedAt: Dateish | null
  rejectedAt: Dateish | null
  createdAt: Dateish
  updatedAt: Dateish
}) {
  return {
    id: resolution.id,
    paymentId: resolution.paymentId,
    bookingId: resolution.bookingId,
    bookingReference: displayReference(resolution.bookingId),
    status: resolution.status,
    reason: resolution.reason,
    amountNGN: resolution.amountNGN,
    currencyCode: resolution.currencyCode,
    provider: resolution.provider,
    customerMessageCode: resolution.customerMessageCode,
    requestedAt: iso(resolution.requestedAt),
    reviewedAt: iso(resolution.reviewedAt),
    approvedAt: iso(resolution.approvedAt),
    processingAt: iso(resolution.processingAt),
    completedAt: iso(resolution.completedAt),
    rejectedAt: iso(resolution.rejectedAt),
    createdAt: iso(resolution.createdAt),
    updatedAt: iso(resolution.updatedAt),
  }
}

export async function enforceSingleHomeWorkPlace(input: {
  userId: string
  type: string
  excludeId?: string
  tx?: Prisma.TransactionClient
}) {
  if (input.type !== 'home' && input.type !== 'work') return { ok: true as const }
  const db = input.tx ?? prisma
  const existing = await db.savedPlace.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true },
  })
  if (existing) return { ok: false as const, code: 'SAVED_PLACE_TYPE_CONFLICT' as MobileErrorCode }
  return { ok: true as const }
}

export async function createPaymentResolutionForPaidCancellation(input: {
  tx: Prisma.TransactionClient
  bookingId: string
  customerId: string
  payments: Array<{
    id: string
    amountNGN: number
    status: string
    provider: string
    providerReference: string | null
    currencyCode: string
  }>
}) {
  const paidPayments = input.payments.filter((payment) => payment.status === 'paid')
  const resolutions = []
  for (const payment of paidPayments) {
    const resolution = await input.tx.paymentResolution.upsert({
      where: { paymentId: payment.id },
      update: {},
      create: {
        paymentId: payment.id,
        bookingId: input.bookingId,
        customerId: input.customerId,
        status: 'review_required',
        reason: 'customer_cancelled_paid_booking',
        amountNGN: payment.amountNGN,
        currencyCode: payment.currencyCode,
        provider: payment.provider,
        providerReference: payment.providerReference,
        customerMessageCode: 'refund_review_required',
      },
    })
    resolutions.push(resolution)
  }
  return resolutions
}

export async function requestCustomerEmailChange(input: {
  principal: MobilePrincipal
  currentPassword: string
  newEmail: string
  locale?: string | null
}) {
  const newEmail = input.newEmail.trim().toLowerCase()
  const user = await prisma.user.findUnique({ where: { id: input.principal.userId } })
  if (!user?.hashedPassword) {
    return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as MobileErrorCode }
  }
  const passwordOk = await bcrypt.compare(input.currentPassword, user.hashedPassword)
  if (!passwordOk)
    return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as MobileErrorCode }

  const existing = await prisma.user.findFirst({
    where: { email: newEmail, id: { not: user.id } },
    select: { id: true },
  })
  if (existing) return { ok: false as const, code: 'EMAIL_ALREADY_IN_USE' as MobileErrorCode }
  if (user.email?.toLowerCase() === newEmail) {
    return { ok: false as const, code: 'EMAIL_ALREADY_IN_USE' as MobileErrorCode }
  }

  const now = new Date()
  const active = await prisma.otpChallenge.findFirst({
    where: {
      userId: user.id,
      purpose: EMAIL_CHANGE_PURPOSE,
      targetNormalized: newEmail,
      consumedAt: null,
      invalidatedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (active && active.resendAvailableAt > now) {
    return {
      ok: false as const,
      code: 'OTP_RESEND_TOO_SOON' as MobileErrorCode,
      expiresAt: active.expiresAt.toISOString(),
      resendAvailableAt: active.resendAvailableAt.toISOString(),
    }
  }

  await prisma.otpChallenge.updateMany({
    where: {
      userId: user.id,
      purpose: EMAIL_CHANGE_PURPOSE,
      consumedAt: null,
      invalidatedAt: null,
    },
    data: { invalidatedAt: now },
  })

  const code = generateOtpCode()
  const challenge = await prisma.otpChallenge.create({
    data: {
      userId: user.id,
      purpose: EMAIL_CHANGE_PURPOSE,
      target: newEmail,
      targetNormalized: newEmail,
      codeHash: hashOtpCode({
        userId: user.id,
        targetNormalized: newEmail,
        purpose: EMAIL_CHANGE_PURPOSE,
        code,
      }),
      maxAttempts: OTP_MAX_ATTEMPTS,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      resendAvailableAt: new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS),
    },
  })

  await notifyMobileEmailOtp({
    email: newEmail,
    code,
    expiresAt: challenge.expiresAt,
    locale: normalizeMobileLocale(input.locale ?? user.locale),
  })

  return {
    ok: true as const,
    verificationId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    resendAvailableAt: challenge.resendAvailableAt.toISOString(),
  }
}

export async function verifyCustomerEmailChange(input: {
  principal: MobilePrincipal
  verificationId: string
  code: string
  device: MobileDeviceInput
}) {
  const now = new Date()
  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      id: input.verificationId,
      userId: input.principal.userId,
      purpose: EMAIL_CHANGE_PURPOSE,
      consumedAt: null,
      invalidatedAt: null,
    },
  })
  if (!challenge) return { ok: false as const, code: 'EMAIL_CHANGE_NOT_FOUND' as MobileErrorCode }
  if (challenge.expiresAt <= now)
    return { ok: false as const, code: 'OTP_EXPIRED' as MobileErrorCode }
  if (challenge.attempts >= challenge.maxAttempts)
    return { ok: false as const, code: 'OTP_ATTEMPTS_EXCEEDED' as MobileErrorCode }

  const emailTaken = await prisma.user.findFirst({
    where: { email: challenge.targetNormalized, id: { not: input.principal.userId } },
    select: { id: true },
  })
  if (emailTaken) return { ok: false as const, code: 'EMAIL_ALREADY_IN_USE' as MobileErrorCode }

  const ok = verifyOtpCode({
    expectedHash: challenge.codeHash,
    userId: challenge.userId,
    targetNormalized: challenge.targetNormalized,
    purpose: EMAIL_CHANGE_PURPOSE,
    code: input.code,
  })
  if (!ok) {
    const updated = await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    })
    return {
      ok: false as const,
      code:
        updated.attempts >= updated.maxAttempts
          ? ('OTP_ATTEMPTS_EXCEEDED' as MobileErrorCode)
          : ('OTP_INVALID' as MobileErrorCode),
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    await tx.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now },
    })
    await tx.otpChallenge.updateMany({
      where: {
        userId: challenge.userId,
        purpose: EMAIL_CHANGE_PURPOSE,
        id: { not: challenge.id },
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    })
    const updated = await tx.user.update({
      where: { id: challenge.userId },
      data: {
        email: challenge.targetNormalized,
        emailVerified: now,
        sessionVersion: { increment: 1 },
      },
    })
    await tx.mobileSession.updateMany({
      where: { userId: challenge.userId, revokedAt: null },
      data: { revokedAt: now },
    })
    return updated
  })

  const tokens = await issueMobileTokens({ user, principalType: 'CUSTOMER', device: input.device })
  return { ok: true as const, user, tokens }
}

export async function uploadCustomerAvatar(input: { principal: MobilePrincipal; file: File }) {
  const uploaded = await uploadAvatarImage(input.principal.userId, input.file)
  if (!uploaded.ok) {
    const message = uploaded.error ?? 'Avatar upload failed'
    const code = message.includes('configured') ? 'AVATAR_STORAGE_UNAVAILABLE' : 'AVATAR_INVALID'
    return { ok: false as const, code: code as MobileErrorCode, message }
  }
  const current = await prisma.user.findUnique({
    where: { id: input.principal.userId },
    select: { image: true },
  })
  const user = await prisma.user.update({
    where: { id: input.principal.userId },
    data: { image: uploaded.url },
  })
  const cleanup = await deleteStorageImageByPublicUrl(current?.image)
  return { ok: true as const, user, avatarUrl: user.image, avatarCleanup: cleanup }
}

export async function deleteCustomerAvatar(principal: MobilePrincipal) {
  const current = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: { image: true },
  })
  const user = await prisma.user.update({
    where: { id: principal.userId },
    data: { image: null },
  })
  const cleanup = await deleteStorageImageByPublicUrl(current?.image)
  return { ok: true as const, user, avatarUrl: null, avatarCleanup: cleanup }
}

export async function deleteCustomerAccount(input: {
  principal: MobilePrincipal
  currentPassword?: string
  confirmation: string
}) {
  if (input.confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
    return {
      ok: false as const,
      code: 'ACCOUNT_DELETE_CONFIRMATION_INVALID' as MobileErrorCode,
    }
  }
  const user = await prisma.user.findUnique({
    where: { id: input.principal.userId },
    include: { accounts: { select: { provider: true } } },
  })
  if (!user || user.anonymizedAt) {
    return { ok: false as const, code: 'ACCOUNT_DELETION_PENDING' as MobileErrorCode }
  }
  if (user.deletionRequestedAt && user.scheduledDeletionAt) {
    return {
      ok: true as const,
      deletion: {
        status: 'pending' as const,
        requestedAt: user.deletionRequestedAt.toISOString(),
        scheduledAt: user.scheduledDeletionAt.toISOString(),
        anonymizedAt: iso(user.anonymizedAt),
      },
    }
  }
  if (user.hashedPassword) {
    if (!input.currentPassword) {
      return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as MobileErrorCode }
    }
    const passwordOk = await bcrypt.compare(input.currentPassword, user.hashedPassword)
    if (!passwordOk)
      return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as MobileErrorCode }
  } else if (user.accounts.some((account) => account.provider === 'google')) {
    const recentSession = await prisma.mobileSession.findUnique({
      where: { id: input.principal.sessionId },
      select: { createdAt: true, lastUsedAt: true, revokedAt: true },
    })
    const latestSessionActivity = recentSession?.lastUsedAt ?? recentSession?.createdAt
    const recentEnough =
      recentSession &&
      !recentSession.revokedAt &&
      latestSessionActivity &&
      latestSessionActivity.getTime() >= Date.now() - ACCOUNT_DELETION_RECENT_SESSION_SECONDS * 1000
    if (!recentEnough) {
      return { ok: false as const, code: 'ACCOUNT_REAUTH_REQUIRED' as MobileErrorCode }
    }
  } else {
    return { ok: false as const, code: 'ACCOUNT_REAUTH_REQUIRED' as MobileErrorCode }
  }

  const now = new Date()
  const scheduledAt = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        disabledAt: now,
        deletionRequestedAt: now,
        scheduledDeletionAt: scheduledAt,
        deletionCancelledAt: null,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.mobileSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.pushDevice.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, invalidatedAt: now },
    }),
  ])
  return {
    ok: true as const,
    deletion: {
      status: 'pending' as const,
      requestedAt: now.toISOString(),
      scheduledAt: scheduledAt.toISOString(),
      anonymizedAt: null,
    },
  }
}

export async function anonymizeDueCustomerAccounts(input: { now?: Date; take?: number } = {}) {
  const now = input.now ?? new Date()
  const take = Math.min(Math.max(input.take ?? 25, 1), 100)
  const users = await prisma.user.findMany({
    where: {
      role: 'user',
      deletionRequestedAt: { not: null },
      scheduledDeletionAt: { lte: now },
      anonymizedAt: null,
    },
    select: { id: true, image: true },
    orderBy: { scheduledDeletionAt: 'asc' },
    take,
  })

  const results = []
  for (const user of users) {
    const anonymizedEmail = `deleted+${user.id}@deleted.beninfy.local`
    const updated = await prisma.$transaction(async (tx) => {
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
      return tx.user.updateMany({
        where: {
          id: user.id,
          deletionRequestedAt: { not: null },
          scheduledDeletionAt: { lte: now },
          anonymizedAt: null,
        },
        data: {
          name: 'Deleted Beninfy Customer',
          email: anonymizedEmail,
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
    })
    const avatarCleanup = updated.count === 1 ? await deleteStorageImageByPublicUrl(user.image) : null
    results.push({ userId: user.id, anonymized: updated.count === 1, avatarCleanup })
  }

  return {
    processed: results.filter((result) => result.anonymized).length,
    checked: users.length,
    results,
  }
}

export async function restorePendingCustomerDeletion(input: { userId: string }) {
  const now = new Date()
  const restored = await prisma.user.updateMany({
    where: {
      id: input.userId,
      role: 'user',
      deletionRequestedAt: { not: null },
      anonymizedAt: null,
    },
    data: {
      disabledAt: null,
      deletionRequestedAt: null,
      scheduledDeletionAt: null,
      deletionCancelledAt: now,
      sessionVersion: { increment: 1 },
    },
  })
  return { ok: restored.count === 1, cancelledAt: now.toISOString() }
}

export async function exportCustomerData(principal: MobilePrincipal) {
  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      locale: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  const [savedPlaces, travelPreference, reviews, bookings, payments] = await Promise.all([
    prisma.savedPlace.findMany({
      where: { userId: principal.userId },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.customerTravelPreference.findUnique({ where: { userId: principal.userId } }),
    prisma.tripReview.findMany({
      where: { customerId: principal.userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.findMany({
      where: { userId: principal.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        from: true,
        to: true,
        date: true,
        returnDate: true,
        tripType: true,
        passengers: true,
        status: true,
        priceNGN: true,
        discountNGN: true,
        couponCode: true,
        pickupAddress: true,
        dropoffAddress: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.payment.findMany({
      where: { booking: { userId: principal.userId } },
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            id: true,
            from: true,
            to: true,
            date: true,
            returnDate: true,
            tripType: true,
            status: true,
          },
        },
      },
    }),
  ])

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      ...user,
      emailVerified: Boolean(user?.emailVerified),
      createdAt: iso(user?.createdAt),
      updatedAt: iso(user?.updatedAt),
    },
    savedPlaces: savedPlaces.map(toSavedPlaceDto),
    travelPreference: toTravelPreferenceDto(travelPreference),
    reviews: reviews.map(toTripReviewDto),
    bookings: bookings.map((booking) => ({
      ...booking,
      reference: displayReference(booking.id),
      date: iso(booking.date),
      returnDate: iso(booking.returnDate),
      createdAt: iso(booking.createdAt),
      updatedAt: iso(booking.updatedAt),
    })),
    payments: payments.map(toPaymentHistoryDto),
  }
}

export function emailChangePolicy() {
  return {
    otpLength: 6,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    resendCooldownSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
    maxAttempts: OTP_MAX_ATTEMPTS,
  }
}

export function accountDeleteConfirmation() {
  return ACCOUNT_DELETE_CONFIRMATION
}

export function passwordPolicy() {
  return { minLength: 8, maxLength: 100, validator: validateMobilePassword }
}
