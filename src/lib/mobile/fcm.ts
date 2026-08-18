import { createSign } from 'crypto'
import type { PushNotificationProvider } from '@/lib/mobile/notifications'

type TokenResponse = {
  access_token?: string
  expires_in?: number
  error_description?: string
}

const tokenCache = globalThis as typeof globalThis & {
  __beninfyFcmToken?: { token: string; expiresAt: number }
}

function clean(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || null
}

export function getFcmConfig() {
  const projectId = clean(process.env.FIREBASE_PROJECT_ID)
  const clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL)
  const privateKey = clean(process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) return null
  return { projectId, clientEmail, privateKey }
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function serviceAccountJwt(config: NonNullable<ReturnType<typeof getFcmConfig>>) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )
  const body = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(body)
  signer.end()
  return `${body}.${signer.sign(config.privateKey).toString('base64url')}`
}

async function accessToken(config: NonNullable<ReturnType<typeof getFcmConfig>>) {
  const cached = tokenCache.__beninfyFcmToken
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: serviceAccountJwt(config),
    }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || 'FCM access token request failed')
  }
  tokenCache.__beninfyFcmToken = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000,
  }
  return json.access_token
}

export function getFcmProvider(): PushNotificationProvider {
  return {
    name: 'fcm',
    async send({ token, title, body, data }) {
      const config = getFcmConfig()
      if (!config) {
        return {
          ok: false,
          classification: 'configuration',
          errorCode: 'FCM_NOT_CONFIGURED',
        }
      }
      try {
        const bearer = await accessToken(config)
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${bearer}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                data,
                android: { priority: 'HIGH' },
                apns: {
                  payload: {
                    aps: { sound: 'default' },
                  },
                },
              },
            }),
            cache: 'no-store',
          }
        )
        const json = (await res.json().catch(() => ({}))) as {
          name?: string
          error?: { status?: string; message?: string }
        }
        if (!res.ok) {
          const status = json.error?.status ?? String(res.status)
          const lower = status.toLowerCase()
          if (lower.includes('not_found') || lower.includes('invalid_argument')) {
            return { ok: false, classification: 'invalid_token', errorCode: status }
          }
          if (lower.includes('permission') || lower.includes('unauthenticated')) {
            return { ok: false, classification: 'configuration', errorCode: status }
          }
          return { ok: false, classification: 'transient', errorCode: status }
        }
        return { ok: true, providerMessageId: json.name }
      } catch (error) {
        return {
          ok: false,
          classification: 'transient',
          errorCode: error instanceof Error ? error.message : 'FCM_SEND_FAILED',
        }
      }
    },
  }
}

