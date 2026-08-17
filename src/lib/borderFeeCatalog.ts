import type { Prisma } from '@prisma/client'
import { borderFees as legacyBorderFees } from '@/data/borderFees'
import { prisma } from '@/lib/prisma'
import type { BorderFee, TripType } from '@/types'

type PrismaClientLike = typeof prisma | Prisma.TransactionClient

export function toDomainBorderFee(fee: {
  id: string
  country: string
  countryFr: string | null
  border: string
  borderFr: string | null
  countries: string[]
  feePerPersonNGN: number
  feeRoundTripNGN: number
  popular: boolean
  icon: string | null
  services: string[]
  servicesFr: string[]
  documents: string[]
  documentsFr: string[]
  tips: string[]
  tipsFr: string[]
}): BorderFee {
  return {
    id: fee.id,
    country: fee.country,
    countryFr: fee.countryFr ?? fee.country,
    border: fee.border,
    borderFr: fee.borderFr ?? fee.border,
    countries: [fee.countries[0] ?? '', fee.countries[1] ?? ''],
    feePerPersonNGN: fee.feePerPersonNGN,
    feeRoundTripNGN: fee.feeRoundTripNGN,
    popular: fee.popular,
    icon: fee.icon ?? 'currency_exchange',
    services: fee.services,
    servicesFr: fee.servicesFr,
    documents: fee.documents,
    documentsFr: fee.documentsFr,
    tips: fee.tips,
    tipsFr: fee.tipsFr,
  }
}

export async function ensureDefaultBorderFees() {
  const existing = await prisma.borderFee.findMany({ select: { id: true } })
  const existingIds = new Set(existing.map((fee) => fee.id))
  const missing = legacyBorderFees.filter((fee) => !existingIds.has(fee.id))

  if (missing.length === 0) return { created: 0 }

  const result = await prisma.borderFee.createMany({
    data: missing.map((fee) => ({
      id: fee.id,
      country: fee.country,
      countryFr: fee.countryFr,
      border: fee.border,
      borderFr: fee.borderFr,
      countries: fee.countries,
      feePerPersonNGN: fee.feePerPersonNGN,
      feeRoundTripNGN: fee.feeRoundTripNGN,
      popular: fee.popular ?? false,
      icon: fee.icon,
      services: fee.services,
      servicesFr: fee.servicesFr,
      documents: fee.documents,
      documentsFr: fee.documentsFr,
      tips: fee.tips,
      tipsFr: fee.tipsFr,
    })),
    skipDuplicates: true,
  })

  return { created: result.count }
}

export async function getPublicBorderFees(client: PrismaClientLike = prisma) {
  const fees = await client.borderFee.findMany({
    orderBy: [{ popular: 'desc' }, { country: 'asc' }, { border: 'asc' }],
  })
  return fees.map(toDomainBorderFee)
}

export async function calculateRouteBorderFeeNGN(input: {
  routeId: string
  tripType: TripType
  client?: PrismaClientLike
}) {
  const client = input.client ?? prisma
  const route = await client.route.findFirst({
    where: { id: input.routeId, available: true },
    select: { id: true, borderFeeIds: true },
  })
  if (!route) return { ok: false as const, code: 'ROUTE_NOT_FOUND' as const, amountNGN: 0 }
  if (route.borderFeeIds.length === 0) {
    return { ok: true as const, amountNGN: 0, borderFees: [] as BorderFee[] }
  }

  const rows = await client.borderFee.findMany({ where: { id: { in: route.borderFeeIds } } })
  const byId = new Map(rows.map((fee) => [fee.id, fee]))
  const missing = route.borderFeeIds.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    return {
      ok: false as const,
      code: 'BORDER_FEE_NOT_CONFIGURED' as const,
      amountNGN: 0,
      missing,
    }
  }

  const amountNGN = route.borderFeeIds.reduce((sum, id) => {
    const fee = byId.get(id)!
    return sum + (input.tripType === 'round-trip' ? fee.feeRoundTripNGN : fee.feePerPersonNGN)
  }, 0)

  return {
    ok: true as const,
    amountNGN,
    borderFees: route.borderFeeIds.map((id) => toDomainBorderFee(byId.get(id)!)),
  }
}
