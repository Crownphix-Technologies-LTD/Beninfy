import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { requireCompletedCustomerOnboarding } from '@/lib/mobile/onboarding'
import {
  CANCELLATION_NOTE_MAX_LENGTH,
  cancelCustomerBooking,
  isCustomerCancellationReason,
} from '@/lib/mobile/customerAccount'

export const runtime = 'nodejs'

const schema = z.object({
  reasonCode: z.string().trim().min(1),
  note: z.string().trim().max(CANCELLATION_NOTE_MAX_LENGTH).optional().nullable(),
})

export async function POST(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const onboarding = await requireCompletedCustomerOnboarding(guard.user)
  if (!onboarding.ok)
    return mobileError(onboarding.code, 'Complete account onboarding to continue', 403, {
      onboarding: onboarding.onboarding,
    })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid cancellation request', parsed.error.flatten())
  if (!isCustomerCancellationReason(parsed.data.reasonCode)) {
    return mobileErrorFromCode('INVALID_CANCELLATION_REASON')
  }

  const { bookingId } = await params
  const result = await cancelCustomerBooking({
    principal: guard.principal,
    bookingId,
    reasonCode: parsed.data.reasonCode,
    note: parsed.data.note ?? null,
  })
  if (!result.ok) return mobileErrorFromCode(result.code)

  return Response.json({
    cancellation: {
      bookingId: result.bookingId,
      bookingStatus: result.bookingStatus,
      legs: result.legs,
      reasonCode: result.reasonCode,
      supportFollowUpRequired: result.supportFollowUpRequired,
      paymentResolutions: result.paymentResolutions,
      idempotent: result.idempotent,
    },
  })
}
