import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import { calculateMobileQuote } from '@/lib/mobile/bookingDiscovery'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return mobileValidationError('Invalid coupon request')
  if (!('couponCode' in body)) return mobileValidationError('Coupon code is required')

  const result = await calculateMobileQuote(body)
  if (!result.ok) return mobileErrorFromCode(result.code, result.message)
  const coupon = result.data.quote.coupon

  return Response.json({
    coupon: coupon
      ? {
          valid: true,
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          calculatedDiscount: coupon.discount,
          currency: result.data.quote.currency,
        }
      : null,
    pricing: result.data.quote.pricing,
  })
}
