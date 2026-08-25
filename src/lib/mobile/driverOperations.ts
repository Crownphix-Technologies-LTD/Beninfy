import { Prisma } from '@prisma/client'
import { writeAuditLog } from '@/lib/auditLog'
import { prisma } from '@/lib/prisma'
import type { MobileErrorCode } from '@/lib/mobile/errors'
import type { MobilePrincipal } from '@/lib/mobile/auth'

export const DRIVER_DUTY_STATUSES = ['available', 'off_duty'] as const
export type DriverDutyStatus = (typeof DRIVER_DUTY_STATUSES)[number]
export const DRIVER_NEW_ASSIGNMENT_STATUSES = ['available'] as const
export const DRIVER_ASSIGNED_TRIP_ACTION_STATUSES = ['available', 'off_duty'] as const

export const DRIVER_TRIP_VIEWS = ['all', 'upcoming', 'active', 'completed'] as const
export type DriverTripView = (typeof DRIVER_TRIP_VIEWS)[number]

export const UPCOMING_DRIVER_TRIP_STATUSES = ['assigned'] as const
export const ACTIVE_DRIVER_TRIP_STATUSES = [
  'dispatched',
  'driver_en_route',
  'driver_arrived',
  'passenger_onboard',
  'in_progress',
] as const
export const COMPLETED_DRIVER_TRIP_STATUSES = ['completed'] as const

export function isDriverDutyStatus(value: unknown): value is DriverDutyStatus {
  return typeof value === 'string' && DRIVER_DUTY_STATUSES.includes(value as DriverDutyStatus)
}

export function canDriverReceiveNewAssignment(value: unknown) {
  return (
    typeof value === 'string' &&
    DRIVER_NEW_ASSIGNMENT_STATUSES.includes(value as (typeof DRIVER_NEW_ASSIGNMENT_STATUSES)[number])
  )
}

export function canDriverExecuteAssignedTrip(value: unknown) {
  return (
    typeof value === 'string' &&
    DRIVER_ASSIGNED_TRIP_ACTION_STATUSES.includes(
      value as (typeof DRIVER_ASSIGNED_TRIP_ACTION_STATUSES)[number]
    )
  )
}

export function normalizeDriverTripView(value: string | null | undefined) {
  if (!value) return { ok: true as const, view: 'all' as DriverTripView }
  if (DRIVER_TRIP_VIEWS.includes(value as DriverTripView)) {
    return { ok: true as const, view: value as DriverTripView }
  }
  return { ok: false as const, code: 'INVALID_TRIP_VIEW' as MobileErrorCode }
}

export function classifyDriverTripView(status: string): DriverTripView {
  if ((UPCOMING_DRIVER_TRIP_STATUSES as readonly string[]).includes(status)) return 'upcoming'
  if ((ACTIVE_DRIVER_TRIP_STATUSES as readonly string[]).includes(status)) return 'active'
  if ((COMPLETED_DRIVER_TRIP_STATUSES as readonly string[]).includes(status)) return 'completed'
  return 'all'
}

export function driverTripWhereForView(
  driverId: string,
  view: DriverTripView
): Prisma.BookingLegWhereInput {
  const base: Prisma.BookingLegWhereInput = { driverId }
  switch (view) {
    case 'upcoming':
      return { ...base, status: { in: [...UPCOMING_DRIVER_TRIP_STATUSES] } }
    case 'active':
      return { ...base, status: { in: [...ACTIVE_DRIVER_TRIP_STATUSES] } }
    case 'completed':
      return { ...base, status: { in: [...COMPLETED_DRIVER_TRIP_STATUSES] } }
    case 'all':
    default:
      return base
  }
}

export function driverTripOrderByForView(
  view: DriverTripView
): Prisma.BookingLegOrderByWithRelationInput[] {
  switch (view) {
    case 'completed':
      return [{ completedAt: 'desc' }, { departureDate: 'desc' }, { id: 'desc' }]
    case 'active':
      return [{ departureDate: 'asc' }, { id: 'asc' }]
    case 'upcoming':
    case 'all':
    default:
      return [{ departureDate: 'asc' }, { id: 'asc' }]
  }
}

export async function updateDriverDutyStatus({
  req,
  principal,
  status,
}: {
  req: Request
  principal: MobilePrincipal
  status: DriverDutyStatus
}) {
  if (!principal.driverId) {
    return { ok: false as const, code: 'DRIVER_NOT_LINKED' as MobileErrorCode }
  }

  const driver = await prisma.driver.findUnique({
    where: { id: principal.driverId },
    select: { id: true, status: true },
  })
  if (!driver) return { ok: false as const, code: 'DRIVER_NOT_LINKED' as MobileErrorCode }
  if (driver.status === 'inactive') {
    return { ok: false as const, code: 'DRIVER_INACTIVE' as MobileErrorCode }
  }

  const changed = await prisma.driver.updateMany({
    where: {
      id: driver.id,
      status: { not: 'inactive' },
    },
    data: { status },
  })
  if (changed.count !== 1) return { ok: false as const, code: 'DRIVER_INACTIVE' as MobileErrorCode }

  await writeAuditLog({
    session: {
      user: {
        id: principal.userId,
        email: principal.email,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
    req,
    action: 'driver_duty_status_update',
    entityType: 'Driver',
    entityId: driver.id,
    metadata: {
      previousStatus: driver.status,
      nextStatus: status,
      actorType: 'driver',
    },
  })

  const updated = await prisma.driver.findUnique({
    where: { id: driver.id },
    include: { presence: true, user: { select: { image: true } } },
  })

  return { ok: true as const, driver: updated }
}
