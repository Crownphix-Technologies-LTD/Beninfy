import { createHash, createSign } from 'node:crypto'
import type {
  ProviderFailureDiagnostic,
  PushNotificationProvider,
} from '@/lib/mobile/notifications'

const tokenCache = globalThis as typeof globalThis & {
  __beninfyFcmToken?: { token: string; expiresAt: number; identity: string }
}

export function getFcmConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/\\n/g, '\n')
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null
}

export function fcmConfigurationStatus() {
  const provider = process.env.PUSH_PROVIDER?.trim().toLowerCase() || 'disabled'
  const missing = [
    !process.env.FIREBASE_PROJECT_ID?.trim() && 'FIREBASE_PROJECT_ID',
    !process.env.FIREBASE_CLIENT_EMAIL?.trim() && 'FIREBASE_CLIENT_EMAIL',
    !process.env.FIREBASE_PRIVATE_KEY?.trim() && 'FIREBASE_PRIVATE_KEY',
  ].filter((value): value is string => Boolean(value))
  return { provider, configured: provider === 'fcm' && missing.length === 0, missing }
}

type FcmError = {
  error?: {
    status?: string
    details?: Array<{
      '@type'?: string
      errorCode?: string
      fieldViolations?: Array<{ field?: string }>
    }>
  }
}

const ALLOWED_PROVIDER_ERROR_CODES = new Set([
  'INVALID_ARGUMENT',
  'UNREGISTERED',
  'SENDER_ID_MISMATCH',
  'THIRD_PARTY_AUTH_ERROR',
  'QUOTA_EXCEEDED',
  'UNAVAILABLE',
  'INTERNAL',
])

const ALLOWED_OAUTH_ERROR_CODES = new Set([
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'access_denied',
  'temporarily_unavailable',
])

function allowlistedCode(value: unknown, allowed: Set<string>, fallback: string) {
  return typeof value === 'string' && allowed.has(value) ? value : fallback
}

function correlationId(headers: Headers) {
  const value =
    headers.get('x-request-id') ??
    headers.get('x-goog-request-id') ??
    headers.get('x-guploader-uploadid')
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : undefined
}

function networkDiagnostic(error: unknown): ProviderFailureDiagnostic {
  const name = error instanceof Error ? error.name : ''
  return {
    stage: 'network',
    providerErrorCode:
      name === 'TimeoutError' || name === 'AbortError' ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
  }
}

export function classifyFcmResponse(status: number, response: FcmError, headers = new Headers()) {
  const details = response.error?.details ?? []
  const fcm = details.find(
    (item) => item['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError'
  )?.errorCode
  const badFields = details.flatMap((item) => item.fieldViolations ?? [])
  const safeProviderCode = allowlistedCode(fcm, ALLOWED_PROVIDER_ERROR_CODES, 'UNKNOWN')
  const diagnostic: ProviderFailureDiagnostic = {
    stage: safeProviderCode === 'UNKNOWN' ? 'fcm_http' : 'fcm_response',
    httpStatus: status,
    providerErrorCode: safeProviderCode,
    correlationId: correlationId(headers),
  }
  // A generic HTTP 400/404 is not proof of an invalid token (e.g. bad payload/project).
  if (
    fcm === 'UNREGISTERED' ||
    (fcm === 'INVALID_ARGUMENT' && badFields.every((item) => item.field === 'message.token'))
  ) {
    return {
      ok: false as const,
      classification: 'invalid_token' as const,
      errorCode: 'FCM_INVALID_TOKEN',
      diagnostic,
    }
  }
  if (
    [400, 401, 403, 404].includes(status) ||
    fcm === 'SENDER_ID_MISMATCH' ||
    fcm === 'THIRD_PARTY_AUTH_ERROR'
  ) {
    return {
      ok: false as const,
      classification: 'configuration' as const,
      errorCode: 'FCM_CONFIGURATION_ERROR',
      diagnostic,
    }
  }
  return {
    ok: false as const,
    classification: 'transient' as const,
    errorCode: status === 429 ? 'FCM_RATE_LIMITED' : 'FCM_UNAVAILABLE',
    diagnostic,
  }
}

function serviceAccountJwt(config: NonNullable<ReturnType<typeof getFcmConfig>>) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: config.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url')
  const body = header + '.' + payload
  const signer = createSign('RSA-SHA256')
  signer.update(body)
  signer.end()
  return body + '.' + signer.sign(config.privateKey).toString('base64url')
}

async function accessToken(config: NonNullable<ReturnType<typeof getFcmConfig>>) {
  const identity = createHash('sha256').update(JSON.stringify(config)).digest('hex')
  const cached = tokenCache.__beninfyFcmToken
  if (cached?.identity === identity && cached.expiresAt > Date.now() + 60000)
    return { ok: true as const, token: cached.token }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: serviceAccountJwt(config),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(3500),
  })
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
  }
  if (!response.ok || !json.access_token)
    return {
      ok: false as const,
      diagnostic: {
        stage: 'oauth' as const,
        httpStatus: response.status,
        providerErrorCode: allowlistedCode(json.error, ALLOWED_OAUTH_ERROR_CODES, 'OAUTH_ERROR'),
        correlationId: correlationId(response.headers),
      },
    }
  tokenCache.__beninfyFcmToken = {
    token: json.access_token,
    identity,
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000,
  }
  return { ok: true as const, token: json.access_token }
}

export function getFcmProvider(): PushNotificationProvider {
  return {
    name: 'fcm',
    async send({ token, title, body, data }) {
      const config = getFcmConfig()
      if (!config)
        return {
          ok: false,
          classification: 'configuration',
          errorCode: 'FCM_NOT_CONFIGURED',
          diagnostic: { stage: 'configuration', providerErrorCode: 'FCM_NOT_CONFIGURED' },
        }
      let authorization: Awaited<ReturnType<typeof accessToken>>
      try {
        authorization = await accessToken(config)
      } catch (error) {
        return {
          ok: false,
          classification: 'configuration',
          errorCode: 'FCM_AUTH_FAILED',
          diagnostic: { ...networkDiagnostic(error), stage: 'oauth' },
        }
      }
      if (!authorization.ok)
        return {
          ok: false,
          classification: 'configuration',
          errorCode: 'FCM_AUTH_FAILED',
          diagnostic: authorization.diagnostic,
        }
      try {
        const response = await fetch(
          'https://fcm.googleapis.com/v1/projects/' +
            encodeURIComponent(config.projectId) +
            '/messages:send',
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + authorization.token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                data,
                android: { priority: 'HIGH', ttl: '300s' },
                apns: {
                  headers: {
                    'apns-push-type': 'alert',
                    'apns-priority': '10',
                    'apns-expiration': String(Math.floor(Date.now() / 1000) + 300),
                  },
                  payload: { aps: { sound: 'default' } },
                },
              },
            }),
            cache: 'no-store',
            signal: AbortSignal.timeout(3500),
          }
        )
        const json = (await response.json().catch(() => ({}))) as FcmError & { name?: string }
        if (!response.ok) {
          if (response.status === 401) delete tokenCache.__beninfyFcmToken
          return classifyFcmResponse(response.status, json, response.headers)
        }
        if (!json.name)
          return {
            ok: false,
            classification: 'transient',
            errorCode: 'FCM_RESPONSE_INVALID',
            diagnostic: {
              stage: 'fcm_response',
              httpStatus: response.status,
              providerErrorCode: 'FCM_RESPONSE_INVALID',
              correlationId: correlationId(response.headers),
            },
          }
        return { ok: true, providerMessageId: json.name }
      } catch (error) {
        // Do not persist/log provider exception messages: they can contain request secrets.
        return {
          ok: false,
          classification: 'transient',
          errorCode: 'FCM_TRANSPORT_FAILED',
          diagnostic: networkDiagnostic(error),
        }
      }
    },
  }
}
