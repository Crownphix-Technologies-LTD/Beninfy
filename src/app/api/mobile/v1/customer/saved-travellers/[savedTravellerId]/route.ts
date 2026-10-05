import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import {
  normalizeSavedTravellerPhone,
  savedTravellerUpdateSchema,
  toSavedTravellerDto,
} from '@/lib/mobile/savedTravellers'

export const runtime = 'nodejs'

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
  { params }: { params: Promise<{ savedTravellerId: string }> }
): Promise<Response> {
  const checked = await guardCustomer(req)
  if ('response' in checked) return checked.response!
  const { savedTravellerId } = await params

  const parsed = savedTravellerUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return mobileValidationError('Invalid saved traveller payload', parsed.error.flatten())
  }
  const phone = parsed.data.phone
    ? normalizeSavedTravellerPhone(parsed.data.phone)
    : parsed.data.phone
  if (parsed.data.phone && !phone) {
    return mobileError('PHONE_INVALID', 'Traveller phone number is invalid', 400)
  }

  const updated = await prisma.savedTraveller.updateMany({
    where: { id: savedTravellerId, userId: checked.guard.principal.userId },
    data: { ...parsed.data, ...(phone ? { phone } : {}) },
  })
  if (updated.count !== 1) return mobileErrorFromCode('SAVED_TRAVELLER_NOT_FOUND')

  const traveller = await prisma.savedTraveller.findFirstOrThrow({
    where: { id: savedTravellerId, userId: checked.guard.principal.userId },
  })
  return Response.json({ savedTraveller: toSavedTravellerDto(traveller) })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ savedTravellerId: string }> }
): Promise<Response> {
  const checked = await guardCustomer(req)
  if ('response' in checked) return checked.response!
  const { savedTravellerId } = await params

  const deleted = await prisma.savedTraveller.deleteMany({
    where: { id: savedTravellerId, userId: checked.guard.principal.userId },
  })
  if (deleted.count !== 1) return mobileErrorFromCode('SAVED_TRAVELLER_NOT_FOUND')
  return Response.json({ deleted: true })
}
