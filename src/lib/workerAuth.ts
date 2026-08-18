import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'

function clean(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || null
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function requireWorkerSecret(req: Request) {
  const expected = clean(process.env.WORKER_SECRET) || clean(process.env.CRON_SECRET)
  if (!expected) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Worker secret is not configured' }, { status: 503 }),
    }
  }
  const header =
    req.headers.get('x-beninfy-worker-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!header || !safeEqual(header, expected)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return { ok: true as const }
}
