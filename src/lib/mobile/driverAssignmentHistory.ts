import { Prisma } from '@prisma/client'

export const DRIVER_ASSIGNMENT_HISTORY_OUTCOMES = [
  'current',
  'completed',
  'declined',
  'released',
  'reassigned',
] as const

export type DriverAssignmentHistoryOutcome = (typeof DRIVER_ASSIGNMENT_HISTORY_OUTCOMES)[number]

type AssignmentHistoryRecord = {
  id?: string
  assignedAt?: Date | string
  declinedAt?: Date | string | null
  releasedAt?: Date | string | null
  completedAt?: Date | string | null
  supersededAt?: Date | string | null
}

type AssignmentHistoryRecordWithAssignedAt = AssignmentHistoryRecord & {
  assignedAt: Date | string
}

type AssignmentHistoryClient = Prisma.TransactionClient

const OPEN_ASSIGNMENT_WHERE = {
  declinedAt: null,
  releasedAt: null,
  completedAt: null,
  supersededAt: null,
} satisfies Prisma.DriverTripAssignmentHistoryWhereInput

export function driverAssignmentHistoryWhereForDriver(
  driverId: string
): Prisma.DriverTripAssignmentHistoryWhereInput {
  return { driverId }
}

export function driverAssignmentHistoryOpenWhere({
  bookingLegId,
  driverId,
}: {
  bookingLegId: string
  driverId: string
}): Prisma.DriverTripAssignmentHistoryWhereInput {
  return {
    bookingLegId,
    driverId,
    ...OPEN_ASSIGNMENT_WHERE,
  }
}

export function driverAssignmentOutcome(
  record: AssignmentHistoryRecord
): DriverAssignmentHistoryOutcome {
  if (record.completedAt) return 'completed'
  if (record.declinedAt) return 'declined'
  if (record.supersededAt) return 'reassigned'
  if (record.releasedAt) return 'released'
  return 'current'
}

export function driverAssignmentEffectiveOutcomeAt(record: AssignmentHistoryRecordWithAssignedAt) {
  const outcome = driverAssignmentOutcome(record)
  switch (outcome) {
    case 'completed':
      return record.completedAt ?? record.assignedAt
    case 'declined':
      return record.declinedAt ?? record.assignedAt
    case 'reassigned':
      return record.supersededAt ?? record.assignedAt
    case 'released':
      return record.releasedAt ?? record.assignedAt
    case 'current':
    default:
      return record.assignedAt
  }
}

function toTime(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function compareDriverAssignmentHistoryByEffectiveOutcomeDesc(
  left: AssignmentHistoryRecordWithAssignedAt,
  right: AssignmentHistoryRecordWithAssignedAt
) {
  const leftTime = toTime(driverAssignmentEffectiveOutcomeAt(left))
  const rightTime = toTime(driverAssignmentEffectiveOutcomeAt(right))
  if (leftTime !== rightTime) return rightTime - leftTime
  return (right.id ?? '').localeCompare(left.id ?? '')
}

export type DriverAssignmentHistoryCursor = {
  effectiveOutcomeAt: string
  id: string
}

export function encodeDriverAssignmentHistoryCursor(
  record: AssignmentHistoryRecordWithAssignedAt & { id: string }
) {
  return Buffer.from(
    JSON.stringify({
      effectiveOutcomeAt: toIso(driverAssignmentEffectiveOutcomeAt(record)),
      id: record.id,
    } satisfies DriverAssignmentHistoryCursor)
  ).toString('base64url')
}

export function decodeDriverAssignmentHistoryCursor(
  cursor: string | null | undefined
): DriverAssignmentHistoryCursor | null {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<
      DriverAssignmentHistoryCursor
    >
    if (typeof parsed.effectiveOutcomeAt !== 'string' || typeof parsed.id !== 'string') return null
    if (Number.isNaN(new Date(parsed.effectiveOutcomeAt).getTime())) return null
    return { effectiveOutcomeAt: parsed.effectiveOutcomeAt, id: parsed.id }
  } catch {
    return null
  }
}

function isAfterCursor(
  record: AssignmentHistoryRecordWithAssignedAt & { id: string },
  cursor: DriverAssignmentHistoryCursor
) {
  const recordTime = toTime(driverAssignmentEffectiveOutcomeAt(record))
  const cursorTime = new Date(cursor.effectiveOutcomeAt).getTime()
  if (recordTime !== cursorTime) return recordTime < cursorTime
  return record.id < cursor.id
}

export function pageDriverAssignmentHistoryRecords<
  T extends AssignmentHistoryRecordWithAssignedAt & { id: string },
>({
  records,
  limit,
  cursor,
}: {
  records: T[]
  limit: number
  cursor?: string | null
}) {
  const sorted = [...records].sort(compareDriverAssignmentHistoryByEffectiveOutcomeDesc)
  const decoded = decodeDriverAssignmentHistoryCursor(cursor)
  const startIndex = decoded
    ? sorted.findIndex((record) => isAfterCursor(record, decoded))
    : cursor
      ? sorted.findIndex((record) => record.id === cursor) + 1
      : 0
  const pageStart = Math.max(0, startIndex)
  const page = sorted.slice(pageStart, pageStart + limit)
  const hasMore = pageStart + limit < sorted.length
  return {
    page,
    hasMore,
    nextCursor:
      hasMore && page.length > 0 ? encodeDriverAssignmentHistoryCursor(page[page.length - 1]) : null,
  }
}

export function driverAssignmentOutcomeLabelKey(outcome: DriverAssignmentHistoryOutcome) {
  return `driverAssignmentHistory.${outcome}`
}

export async function ensureDriverAssignmentHistory({
  tx,
  bookingLegId,
  driverId,
  assignedAt,
}: {
  tx: AssignmentHistoryClient
  bookingLegId: string
  driverId: string
  assignedAt?: Date | null
}) {
  const open = await tx.driverTripAssignmentHistory.findFirst({
    where: driverAssignmentHistoryOpenWhere({ bookingLegId, driverId }),
    select: { id: true },
  })
  if (open) return open

  return tx.driverTripAssignmentHistory.create({
    data: {
      bookingLegId,
      driverId,
      assignedAt: assignedAt ?? new Date(),
    },
    select: { id: true },
  })
}

export async function recordDriverAssignmentChange({
  tx,
  bookingLegId,
  previousDriverId,
  nextDriverId,
  assignedAt,
  occurredAt = new Date(),
  releaseReason,
  releaseSource = 'admin',
}: {
  tx: AssignmentHistoryClient
  bookingLegId: string
  previousDriverId?: string | null
  nextDriverId?: string | null
  assignedAt?: Date | null
  occurredAt?: Date
  releaseReason?: string | null
  releaseSource?: string | null
}) {
  if (previousDriverId && previousDriverId !== nextDriverId) {
    const reassigned = Boolean(nextDriverId)
    await tx.driverTripAssignmentHistory.updateMany({
      where: driverAssignmentHistoryOpenWhere({ bookingLegId, driverId: previousDriverId }),
      data: {
        releasedAt: occurredAt,
        supersededAt: reassigned ? occurredAt : undefined,
        releaseReason: releaseReason ?? (reassigned ? 'reassigned' : 'released'),
        releaseSource,
      },
    })
  }

  if (nextDriverId && previousDriverId !== nextDriverId) {
    await ensureDriverAssignmentHistory({
      tx,
      bookingLegId,
      driverId: nextDriverId,
      assignedAt: assignedAt ?? occurredAt,
    })
  }
}

export async function markDriverAssignmentAccepted({
  tx,
  bookingLegId,
  driverId,
  acceptedAt = new Date(),
}: {
  tx: AssignmentHistoryClient
  bookingLegId: string
  driverId: string
  acceptedAt?: Date
}) {
  await ensureDriverAssignmentHistory({ tx, bookingLegId, driverId, assignedAt: acceptedAt })
  return tx.driverTripAssignmentHistory.updateMany({
    where: {
      ...driverAssignmentHistoryOpenWhere({ bookingLegId, driverId }),
      acceptedAt: null,
    },
    data: { acceptedAt },
  })
}

export async function markDriverAssignmentDeclined({
  tx,
  bookingLegId,
  driverId,
  declinedAt = new Date(),
  releaseReason,
  releaseSource = 'driver',
}: {
  tx: AssignmentHistoryClient
  bookingLegId: string
  driverId: string
  declinedAt?: Date
  releaseReason?: string | null
  releaseSource?: string | null
}) {
  await ensureDriverAssignmentHistory({ tx, bookingLegId, driverId, assignedAt: declinedAt })
  return tx.driverTripAssignmentHistory.updateMany({
    where: driverAssignmentHistoryOpenWhere({ bookingLegId, driverId }),
    data: {
      declinedAt,
      releasedAt: declinedAt,
      releaseReason: releaseReason ?? 'driver_declined',
      releaseSource,
    },
  })
}

export async function markDriverAssignmentReleased({
  tx,
  bookingLegId,
  driverId,
  releasedAt = new Date(),
  releaseReason,
  releaseSource,
}: {
  tx: AssignmentHistoryClient
  bookingLegId: string
  driverId: string
  releasedAt?: Date
  releaseReason?: string | null
  releaseSource?: string | null
}) {
  await ensureDriverAssignmentHistory({ tx, bookingLegId, driverId, assignedAt: releasedAt })
  return tx.driverTripAssignmentHistory.updateMany({
    where: driverAssignmentHistoryOpenWhere({ bookingLegId, driverId }),
    data: {
      releasedAt,
      releaseReason: releaseReason ?? 'released',
      releaseSource,
    },
  })
}

export async function markDriverAssignmentCompleted({
  tx,
  bookingLegId,
  driverId,
  completedAt = new Date(),
}: {
  tx: AssignmentHistoryClient
  bookingLegId: string
  driverId: string
  completedAt?: Date
}) {
  await ensureDriverAssignmentHistory({ tx, bookingLegId, driverId, assignedAt: completedAt })
  return tx.driverTripAssignmentHistory.updateMany({
    where: driverAssignmentHistoryOpenWhere({ bookingLegId, driverId }),
    data: { completedAt },
  })
}
