import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { completeCustomerOtpSignup, recordCustomerOtpAudit } from '@/lib/mobile/customerOtpAuth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

const schema = z.object({
  challengeId: z.string().trim().min(32).max(120),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(30),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  locale: z.enum(['en', 'fr']).optional(),
  device: z
    .object({
      deviceId: z.string().trim().max(120).optional(),
      platform: z.string().trim().max(40).optional(),
      deviceName: z.string().trim().max(120).optional(),
      appVersion: z.string().trim().max(40).optional(),
    })
    .optional(),
})

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid signup request', parsed.error.flatten())

  const rate = await checkRateLimit({
    scope: 'customer-otp-signup',
    identifier: `${parsed.data.challengeId}:${requestIp(req)}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!rate.allowed) {
    await recordCustomerOtpAudit('customer_otp_rate_limited', parsed.data.challengeId, {
      operation: 'signup',
    })
    return mobileError('OTP_RATE_LIMITED', 'Too many signup attempts', 429, {
      retryAfter: rate.retryAfter,
    })
  }
  const result = await completeCustomerOtpSignup(parsed.data)
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json(result, { status: 201 })
}
