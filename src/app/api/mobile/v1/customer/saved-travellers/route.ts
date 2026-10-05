import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import {
  normalizeSavedTravellerPhone,
  savedTravellerCreateSchema,
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

export async function GET(req: Request): Promise<Response> {
  const checked = await guardCustomer(req)
  if ('response' in checked) return checked.response!

  const travellers = await prisma.savedTraveller.findMany({
    where: { userId: checked.guard.principal.userId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  })

  return Response.json({ savedTravellers: travellers.map(toSavedTravellerDto) })
}

export async function POST(req: Request): Promise<Response> {
  const checked = await guardCustomer(req)
  if ('response' in checked) return checked.response!

  const parsed = savedTravellerCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return mobileValidationError('Invalid saved traveller payload', parsed.error.flatten())
  }
  const phone = normalizeSavedTravellerPhone(parsed.data.phone)
  if (!phone) return mobileError('PHONE_INVALID', 'Traveller phone number is invalid', 400)

  const traveller = await prisma.savedTraveller.create({
    data: {
      userId: checked.guard.principal.userId,
      ...parsed.data,
      phone,
    },
  })

  return Response.json({ savedTraveller: toSavedTravellerDto(traveller) }, { status: 201 })
}
