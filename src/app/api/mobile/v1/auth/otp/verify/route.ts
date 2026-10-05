import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { recordCustomerOtpAudit, verifyCustomerOtp } from '@/lib/mobile/customerOtpAuth'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

const deviceSchema = z
  .object({
    deviceId: z.string().trim().max(120).optional(),
    platform: z.string().trim().max(40).optional(),
    deviceName: z.string().trim().max(120).optional(),
    appVersion: z.string().trim().max(40).optional(),
  })
  .optional()

const schema = z.object({
  challengeId: z.string().trim().min(32).max(120),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  device: deviceSchema,
})

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid verification request', parsed.error.flatten())

  const rate = await checkRateLimit({
    scope: 'customer-otp-verify',
    identifier: `${parsed.data.challengeId}:${requestIp(req)}`,
    limit: 12,
    windowMs: 15 * 60 * 1000,
  })
  if (!rate.allowed) {
    await recordCustomerOtpAudit('customer_otp_rate_limited', parsed.data.challengeId, {
      operation: 'verify',
    })
    return mobileError('OTP_RATE_LIMITED', 'Too many verification attempts', 429, {
      retryAfter: rate.retryAfter,
    })
  }
  const result = await verifyCustomerOtp(parsed.data)
  if (!result.ok) return mobileErrorFromCode(result.code)
  return Response.json(result)
}
