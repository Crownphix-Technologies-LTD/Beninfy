import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import {
  enforceSingleHomeWorkPlace,
  SAVED_PLACE_TYPES,
  toSavedPlaceDto,
  validCoordinates,
} from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

const schema = z.object({
  type: z.enum(SAVED_PLACE_TYPES).optional(),
  label: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().min(3).max(300).optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  providerPlaceId: z.string().trim().max(180).optional().nullable(),
})

async function guardCustomer(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return { response: mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED') }
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok) {
    return {
      response: mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
        onboarding: onboarding.onboarding,
      }),
    }
  }
  return { guard }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ savedPlaceId: string }> }
) {
  const checked = await guardCustomer(req)
  if ('response' in checked) return checked.response
  const { savedPlaceId } = await params

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid saved place payload', parsed.error.flatten())
  if (!validCoordinates(parsed.data.latitude, parsed.data.longitude)) {
    return mobileValidationError('Latitude and longitude must be supplied together and be valid')
  }

  const existing = await prisma.savedPlace.findFirst({
    where: { id: savedPlaceId, userId: checked.guard.principal.userId },
  })
  if (!existing) return mobileErrorFromCode('SAVED_PLACE_NOT_FOUND')

  const nextType = parsed.data.type ?? existing.type
  const uniqueness = await enforceSingleHomeWorkPlace({
    userId: checked.guard.principal.userId,
    type: nextType,
    excludeId: savedPlaceId,
  })
  if (!uniqueness.ok) return mobileErrorFromCode(uniqueness.code)

  const place = await prisma.savedPlace.update({
    where: { id: savedPlaceId },
    data: parsed.data,
  })

  return Response.json({ savedPlace: toSavedPlaceDto(place) })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ savedPlaceId: string }> }
) {
  const checked = await guardCustomer(req)
  if ('response' in checked) return checked.response
  const { savedPlaceId } = await params

  const deleted = await prisma.savedPlace.deleteMany({
    where: { id: savedPlaceId, userId: checked.guard.principal.userId },
  })
  if (deleted.count !== 1) return mobileErrorFromCode('SAVED_PLACE_NOT_FOUND')

  return Response.json({ deleted: true })
}
