import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

export const deletionRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(254)
      .email()
      .transform((value) => value.toLowerCase()),
    locale: z.enum(['en', 'fr']),
    website: z.string().max(200).optional(),
  })
  .strict()
export const deletionConfirmSchema = z
  .object({
    requestId: z.string().uuid(),
    code: z.string().regex(/^\d{8}$/),
    confirmation: z.literal('DELETE_MY_ACCOUNT'),
  })
  .strict()

export function deletionJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}

export function deletionRequestAllowed(req: Request) {
  const origin = req.headers.get('origin')
  const local =
    process.env.NODE_ENV !== 'production' &&
    origin === new URL(req.url).origin &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  return (
    (origin === 'https://www.beninfy.com' || origin === 'https://beninfy.com' || local) &&
    req.headers.get('sec-fetch-site') !== 'cross-site' &&
    req.headers.get('content-type')?.split(';')[0].trim() === 'application/json'
  )
}

export async function readDeletionBody(req: Request) {
  // Bound streamed input as well as Content-Length; do not trust caller metadata.
  const reader = req.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return null
  }
}

export async function deletionIpLimit(req: Request, action: 'request' | 'confirm') {
  return checkRateLimit({
    scope: `web-account-deletion-${action}-ip`,
    identifier: requestIp(req),
    limit: action === 'request' ? 5 : 20,
    windowMs: 15 * 60000,
  })
}
