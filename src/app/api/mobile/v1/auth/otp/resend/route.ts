import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { recordCustomerOtpAudit, resendCustomerOtp } from '@/lib/mobile/customerOtpAuth'
import { OtpDeliveryError } from '@/lib/mobile/otpDelivery'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

const schema = z.object({ challengeId: z.string().trim().min(32).max(120) })

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid resend request', parsed.error.flatten())

  const rate = await checkRateLimit({
    scope: 'customer-otp-resend',
    identifier: `${parsed.data.challengeId}:${requestIp(req)}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!rate.allowed) {
    await recordCustomerOtpAudit('customer_otp_rate_limited', parsed.data.challengeId, {
      operation: 'resend',
    })
    return mobileError('OTP_RATE_LIMITED', 'Too many verification code requests', 429, {
      retryAfter: rate.retryAfter,
    })
  }

  try {
    const result = await resendCustomerOtp(parsed.data)
    if (!result.ok) {
      if (result.code === 'OTP_RESEND_TOO_SOON') {
        return mobileError(result.code, 'Please wait before requesting another code', 429, {
          retryAfter: result.retryAfter,
        })
      }
      return mobileErrorFromCode(result.code)
    }
    return Response.json({ challenge: result }, { status: 202 })
  } catch (error) {
    if (error instanceof OtpDeliveryError) return mobileErrorFromCode('OTP_DELIVERY_UNAVAILABLE')
    throw error
  }
}
