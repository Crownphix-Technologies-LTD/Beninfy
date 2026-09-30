import { NextResponse } from 'next/server'
import { fcmConfigurationStatus } from '@/lib/mobile/fcm'

export const runtime = 'nodejs'

export function GET() {
  const push = fcmConfigurationStatus()
  const ready = process.env.VERCEL_ENV !== 'production' || push.configured
  return NextResponse.json(
    {
      ok: ready,
      service: 'beninfy',
      status: ready ? 'healthy' : 'configuration_required',
      readiness: { push },
      deployment: {
        vercelEnv: process.env.VERCEL_ENV ?? null,
        gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
