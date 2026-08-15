import { z } from 'zod'
import { revokeMobileRefreshToken } from '@/lib/mobile/auth'
import { mobileValidationError } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

const schema = z.object({
  refreshToken: z.string().min(20),
})

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid input', parsed.error.flatten())
  await revokeMobileRefreshToken(parsed.data.refreshToken)
  return Response.json({ ok: true })
}
