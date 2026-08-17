import { mobileSupportConfig } from '@/lib/mobile/supportConfig'

export const runtime = 'nodejs'

export async function GET() {
  return Response.json({ support: mobileSupportConfig() })
}
