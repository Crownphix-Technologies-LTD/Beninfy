const DEFAULT_BUCKET = 'beninfy-media'

type CatalogKind = 'vehicles' | 'tours'

function getSupabaseStorageConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET

  if (!url) return { error: 'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not configured' as const }
  if (!key) return { error: 'SUPABASE_SECRET_KEY is not configured' as const }

  return { url, key, bucket }
}

function extensionForType(type: string) {
  switch (type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/avif':
      return 'avif'
    default:
      return 'bin'
  }
}

function hasImageSignature(type: string, buffer: Buffer) {
  if (type === 'image/jpeg') {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9
  }
  if (type === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (type === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  if (type === 'image/avif') {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp' && buffer.subarray(8, 20).toString('ascii').includes('avif')
  }
  return false
}

export async function uploadCatalogImage(kind: CatalogKind, id: string, file: File) {
  const config = getSupabaseStorageConfig()
  if ('error' in config) {
    return { ok: false as const, error: config.error }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (!hasImageSignature(file.type, buffer)) {
    return { ok: false as const, error: 'Image file content does not match its declared type' }
  }

  const extension = extensionForType(file.type)
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '-')
  const path = `${kind}/${safeId}/${Date.now()}.${extension}`
  const uploadUrl = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${path}`

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': file.type,
      'Cache-Control': '31536000',
      'x-upsert': 'true',
    },
    body: buffer,
  })

  if (!res.ok) {
    const message = await res.text().catch(() => '')
    return {
      ok: false as const,
      error: `Supabase Storage upload failed (${res.status})${message ? `: ${message.slice(0, 180)}` : ''}`,
    }
  }

  return {
    ok: true as const,
    url: `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${path}`,
  }
}
