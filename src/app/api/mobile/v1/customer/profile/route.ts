import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { toCustomerProfileDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
})

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  return Response.json({ user: toCustomerProfileDto(guard.user) })
}

export async function PATCH(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid input', parsed.error.flatten())

  const user = await prisma.user.update({
    where: { id: guard.principal.userId },
    data: parsed.data,
  })

  return Response.json({ user: toCustomerProfileDto(user) })
}
