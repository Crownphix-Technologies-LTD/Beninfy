import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { recordCustomerOtpAudit, startCustomerOtp } from '@/lib/mobile/customerOtpAuth'
import { OtpDeliveryError } from '@/lib/mobile/otpDelivery'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { normalizeMobilePhone } from '@/lib/mobile/onboarding'

export const runtime = 'nodejs'

const schema = z.object({
  email: z.string().trim().email().max(254),
  channel: z.enum(['email', 'sms']),
  phone: z.string().trim().max(30).optional(),
  locale: z.enum(['en', 'fr']).optional(),
})

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid OTP request', parsed.error.flatten())

  const email = parsed.data.email.toLowerCase()
  const destination =
    parsed.data.channel === 'sms' ? (normalizeMobilePhone(parsed.data.phone ?? '') ?? email) : email
  const ip = requestIp(req)
  const [ipLimit, destinationLimit] = await Promise.all([
    checkRateLimit({
      scope: 'customer-otp-start-ip',
      identifier: ip,
      limit: 12,
      windowMs: 60 * 60 * 1000,
    }),
    checkRateLimit({
      scope: 'customer-otp-start-destination',
      identifier: destination,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    }),
  ])
  if (!ipLimit.allowed || !destinationLimit.allowed) {
    await recordCustomerOtpAudit('customer_otp_rate_limited', null, { operation: 'start' })
    return mobileError('OTP_RATE_LIMITED', 'Too many verification code requests', 429, {
      retryAfter: Math.max(ipLimit.retryAfter, destinationLimit.retryAfter),
    })
  }

  try {
    const result = await startCustomerOtp(parsed.data)
    if (!result.ok) return mobileErrorFromCode(result.code)
    return Response.json({ challenge: result }, { status: 202 })
  } catch (error) {
    if (error instanceof OtpDeliveryError) return mobileErrorFromCode('OTP_DELIVERY_UNAVAILABLE')
    throw error
  }
}
