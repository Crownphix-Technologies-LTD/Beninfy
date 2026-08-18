type BroadcastResult =
  | { ok: true; provider: 'supabase-broadcast' | 'disabled' }
  | { ok: false; provider: 'supabase-broadcast' | 'disabled'; error: string }

function clean(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || null
}

export function getSupabaseRealtimeConfig() {
  const url = clean(process.env.SUPABASE_URL) || clean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SECRET_KEY) || clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !key) return null
  return {
    url: url.replace(/\/+$/, ''),
    key,
  }
}

export function realtimeBroadcastEnabled() {
  return Boolean(getSupabaseRealtimeConfig())
}

export async function publishSupabaseBroadcast({
  channel,
  event,
  payload,
  timeoutMs = 2500,
}: {
  channel: string
  event: string
  payload: unknown
  timeoutMs?: number
}): Promise<BroadcastResult> {
  const config = getSupabaseRealtimeConfig()
  if (!config) return { ok: true, provider: 'disabled' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${config.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ topic: channel, event, payload }],
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        provider: 'supabase-broadcast',
        error: `Supabase Broadcast failed (${res.status})${text ? `: ${text.slice(0, 160)}` : ''}`,
      }
    }
    return { ok: true, provider: 'supabase-broadcast' }
  } catch (error) {
    return {
      ok: false,
      provider: 'supabase-broadcast',
      error: error instanceof Error ? error.message : 'Supabase Broadcast failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}

