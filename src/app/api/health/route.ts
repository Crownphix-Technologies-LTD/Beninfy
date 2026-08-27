import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'beninfy',
      status: 'healthy',
      deployment: {
        vercelEnv: process.env.VERCEL_ENV ?? null,
        gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
