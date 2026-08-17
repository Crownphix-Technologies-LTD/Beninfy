import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { toTravelPreferenceDto } from '@/lib/mobile/customerProduct'

export const runtime = 'nodejs'

const schema = z.object({
  preferredVehicleId: z.string().trim().min(1).max(80).optional().nullable(),
  defaultPassengers: z.number().int().min(1).max(50).optional().nullable(),
  defaultPickupInstructions: z.string().trim().max(500).optional().nullable(),
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

export async function GET(req: Request) {
  const checked = await guardCustomer(req)
  if ('response' in checked) return checked.response

  const preference = await prisma.customerTravelPreference.findUnique({
    where: { userId: checked.guard.principal.userId },
  })

  return Response.json({ travelPreference: toTravelPreferenceDto(preference) })
}

export async function PATCH(req: Request) {
  const checked = await guardCustomer(req)
  if ('response' in checked) return checked.response

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return mobileValidationError('Invalid travel preference payload', parsed.error.flatten())
  }

  if (parsed.data.preferredVehicleId) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: parsed.data.preferredVehicleId },
      select: { id: true, available: true },
    })
    if (!vehicle?.available) return mobileErrorFromCode('VEHICLE_NOT_AVAILABLE')
  }

  const preference = await prisma.customerTravelPreference.upsert({
    where: { userId: checked.guard.principal.userId },
    update: parsed.data,
    create: {
      userId: checked.guard.principal.userId,
      ...parsed.data,
    },
  })

  return Response.json({ travelPreference: toTravelPreferenceDto(preference) })
}
