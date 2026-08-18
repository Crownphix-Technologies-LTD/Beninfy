import { z } from 'zod'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'
import { realtimeChannelForDriver, signPresenceScope, upsertDriverPresence } from '@/lib/mobile/tracking'

export const runtime = 'nodejs'

const schema = z.object({
  status: z.enum(['online', 'offline']),
  currentBookingLegId: z.string().optional().nullable(),
})

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'DRIVER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  if (!guard.principal.driverId) return mobileErrorFromCode('DRIVER_NOT_LINKED')

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    return mobileValidationError('Invalid presence payload', parsed.error.flatten())

  const presence = await upsertDriverPresence({
    driverId: guard.principal.driverId,
    status: parsed.data.status,
    currentBookingLegId: parsed.data.currentBookingLegId ?? null,
  })

  return Response.json({
    presence: {
      status: presence.status,
      lastSeenAt: presence.lastSeenAt.toISOString(),
      lastHeartbeatAt: presence.lastHeartbeatAt?.toISOString() ?? null,
      currentBookingLegId: presence.currentBookingLegId,
      realtime: signPresenceScope({
        principalType: 'driver',
        principalId: guard.principal.driverId,
        driverId: guard.principal.driverId,
        channel: realtimeChannelForDriver(guard.principal.driverId),
      }),
    },
  })
}
