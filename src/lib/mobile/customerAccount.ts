import bcrypt from 'bcryptjs'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notifyBookingStatusChanged } from '@/lib/notifications'
import { notifyTripLifecyclePush } from '@/lib/mobile/notifications'
import { validateMobilePassword, normalizeMobileLocale } from '@/lib/mobile/onboarding'
import { issueMobileTokens, type MobileDeviceInput, type MobilePrincipal } from '@/lib/mobile/auth'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import {
  createPaymentResolutionForPaidCancellation,
  toPaymentResolutionDto,
} from '@/lib/mobile/customerProduct'

export const CUSTOMER_CANCELLATION_REASONS = [
  'change_of_plans',
  'wrong_booking_details',
  'duplicate_booking',
  'schedule_changed',
  'driver_delay',
  'price_issue',
  'other',
] as const

export type CustomerCancellationReason = (typeof CUSTOMER_CANCELLATION_REASONS)[number]

export const CANCELLATION_NOTE_MAX_LENGTH = 500
export const CUSTOMER_CANCELLATION_BLOCKING_STATUSES = [
  'driver_en_route',
  'driver_arrived',
  'passenger_onboard',
  'in_progress',
] as const

export function isCustomerCancellationReason(value: unknown): value is CustomerCancellationReason {
  return (
    typeof value === 'string' &&
    CUSTOMER_CANCELLATION_REASONS.includes(value as CustomerCancellationReason)
  )
}

export function cancellationReasonCatalogue() {
  return CUSTOMER_CANCELLATION_REASONS.map((code) => ({
    code,
    labelKey: `bookingCancellation.${code}`,
  }))
}

export function isCustomerCancellationBlockedByLegStatus(status: string) {
  return (CUSTOMER_CANCELLATION_BLOCKING_STATUSES as readonly string[]).includes(status)
}

export function customerCancellationEligibility(input: {
  bookingStatus: string
  legStatuses: string[]
}) {
  if (input.bookingStatus === 'cancelled') return { ok: true as const, idempotent: true }
  if (
    input.bookingStatus === 'completed' ||
    input.legStatuses.length === 0 ||
    input.legStatuses.every((status) => status === 'completed')
  ) {
    return { ok: false as const, code: 'BOOKING_NOT_CANCELLABLE' as MobileErrorCode }
  }
  if (input.legStatuses.some((status) => status === 'completed')) {
    return {
      ok: false as const,
      code: 'PARTIAL_CANCELLATION_NOT_SUPPORTED' as MobileErrorCode,
    }
  }
  if (input.legStatuses.some(isCustomerCancellationBlockedByLegStatus)) {
    return { ok: false as const, code: 'TRIP_ALREADY_STARTED' as MobileErrorCode }
  }
  return { ok: true as const, idempotent: false }
}

export async function cancelCustomerBooking({
  principal,
  bookingId,
  reasonCode,
  note,
}: {
  principal: MobilePrincipal
  bookingId: string
  reasonCode: CustomerCancellationReason
  note?: string | null
}) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId: principal.userId },
    include: {
      legs: {
        select: {
          id: true,
          status: true,
          driverId: true,
          direction: true,
        },
        orderBy: { departureDate: 'asc' },
      },
      payments: {
        select: {
          id: true,
          amountNGN: true,
          status: true,
          provider: true,
          providerReference: true,
          currencyCode: true,
        },
      },
    },
  })

  if (!booking) return { ok: false as const, code: 'BOOKING_NOT_FOUND' as MobileErrorCode }

  const supportFollowUpRequired = booking.payments.some((payment) => payment.status === 'paid')
  const eligibility = customerCancellationEligibility({
    bookingStatus: booking.status,
    legStatuses: booking.legs.map((leg) => leg.status),
  })

  if (!eligibility.ok) return { ok: false as const, code: eligibility.code }
  if (eligibility.idempotent) {
    return {
      ok: true as const,
      bookingId: booking.id,
      bookingStatus: booking.status,
      legs: booking.legs.map((leg) => ({
        id: leg.id,
        direction: leg.direction,
        status: leg.status,
      })),
      reasonCode,
      supportFollowUpRequired,
      paymentResolutions: [],
      idempotent: true,
    }
  }

  const previousDrivers = booking.legs
    .filter((leg) => leg.driverId)
    .map((leg) => ({ bookingLegId: leg.id, driverId: leg.driverId }))
  const now = new Date()

  const txResult = await prisma.$transaction(async (tx) => {
    const result = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: 'cancelled',
        legs: {
          updateMany: {
            where: { status: { notIn: ['completed', 'cancelled'] } },
            data: {
              status: 'cancelled',
              driverId: null,
              cancelledAt: now,
              cancelledBy: 'customer',
              cancellationReasonCode: reasonCode,
              notes: note || undefined,
            },
          },
        },
      },
      include: {
        legs: {
          select: { id: true, direction: true, status: true },
          orderBy: { departureDate: 'asc' },
        },
      },
    })
    await expireCancelledTracking(
      result.legs.map((leg) => leg.id),
      tx
    )
    const paymentResolutions = await createPaymentResolutionForPaidCancellation({
      tx,
      bookingId: booking.id,
      customerId: booking.userId ?? principal.userId,
      payments: booking.payments,
    })
    return { booking: result, paymentResolutions }
  })
  const updated = txResult.booking

  await Promise.allSettled([
    notifyBookingStatusChanged(updated.id, 'cancelled'),
    ...previousDrivers.map((assignment) =>
      notifyTripLifecyclePush({
        bookingId: updated.id,
        bookingLegId: assignment.bookingLegId,
        nextStatus: 'cancelled',
        driverId: assignment.driverId,
      })
    ),
  ])

  return {
    ok: true as const,
    bookingId: updated.id,
    bookingStatus: updated.status,
    legs: updated.legs,
    reasonCode,
    supportFollowUpRequired,
    paymentResolutions: txResult.paymentResolutions.map(toPaymentResolutionDto),
    idempotent: false,
  }
}

async function expireCancelledTracking(bookingLegIds: string[], tx: Prisma.TransactionClient) {
  const now = new Date()
  await tx.driverPresence.updateMany({
    where: { currentBookingLegId: { in: bookingLegIds } },
    data: { currentBookingLegId: null, lastSeenAt: now },
  })
  await tx.latestTripLocation.updateMany({
    where: { bookingLegId: { in: bookingLegIds } },
    data: { expiresAt: now },
  })
}

export async function changeCustomerPassword({
  principal,
  currentPassword,
  newPassword,
  device,
}: {
  principal: MobilePrincipal
  currentPassword: string
  newPassword: string
  device: MobileDeviceInput
}) {
  if (!validateMobilePassword(newPassword)) {
    return { ok: false as const, code: 'PASSWORD_INVALID' as MobileErrorCode }
  }

  const user = await prisma.user.findUnique({ where: { id: principal.userId } })
  if (!user?.hashedPassword) {
    return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as MobileErrorCode }
  }
  const currentOk = await bcrypt.compare(currentPassword, user.hashedPassword)
  if (!currentOk) {
    return { ok: false as const, code: 'CURRENT_PASSWORD_INVALID' as MobileErrorCode }
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12)
  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        sessionVersion: { increment: 1 },
      },
    })
    await tx.mobileSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return updated
  })

  const tokens = await issueMobileTokens({
    user: updatedUser,
    principalType: 'CUSTOMER',
    device,
  })

  return { ok: true as const, user: updatedUser, tokens }
}

export async function logoutAllMobileSessions(principal: MobilePrincipal) {
  const now = new Date()
  await prisma.$transaction([
    prisma.user.update({
      where: { id: principal.userId },
      data: { sessionVersion: { increment: 1 } },
    }),
    prisma.mobileSession.updateMany({
      where: { userId: principal.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ])
  return { ok: true as const }
}

export function normalizeCustomerSettingsLocale(locale: unknown) {
  return locale === 'en' || locale === 'fr' ? normalizeMobileLocale(locale) : null
}
