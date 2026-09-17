import { requireAdminPermission } from '@/lib/admin'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return guard.response
  const rates = await prisma.tourCommercialRate.findMany({ orderBy: { priceMinor: 'asc' } })
  return Response.json({
    rates: rates.map((rate) => ({ ...rate, priceNGN: rate.priceMinor / 100 })),
  })
}
