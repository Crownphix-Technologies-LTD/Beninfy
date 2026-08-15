import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { normalizeCustomerSettingsLocale } from '@/lib/mobile/customerAccount'

export const runtime = 'nodejs'

const schema = z.object({
  locale: z.enum(['en', 'fr']),
})

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  return Response.json({ settings: { locale: guard.user.locale ?? 'en' } })
}

export async function PATCH(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid settings payload', parsed.error.flatten())

  const locale = normalizeCustomerSettingsLocale(parsed.data.locale)
  if (!locale) return mobileValidationError('Unsupported locale')

  const user = await prisma.user.update({
    where: { id: guard.principal.userId },
    data: { locale },
  })

  return Response.json({ settings: { locale: user.locale ?? 'en' } })
}
