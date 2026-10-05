import { z } from 'zod'
import { mobileDiscoverySelectionSchema } from '@/lib/mobile/bookingDiscovery'

export const GUEST_REQUEST_MAX_BYTES = 16 * 1024

export const guestRideSelectionSchema = mobileDiscoverySelectionSchema
  .omit({ fleetVehicleId: true, couponCode: true })
  .strict()

export type GuestSafeAvailability = {
  status: string
  available: boolean
  informationalOnly: true
  dates: Array<{ date: string; available: boolean }>
}

export async function readGuestJson(req: Request, maxBytes = GUEST_REQUEST_MAX_BYTES) {
  const declaredLength = Number(req.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false as const, reason: 'too_large' as const }
  }

  const raw = await req.text().catch(() => null)
  if (raw === null) return { ok: false as const, reason: 'invalid' as const }
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    return { ok: false as const, reason: 'too_large' as const }
  }

  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false as const, reason: 'invalid' as const }
    }
    return { ok: true as const, value }
  } catch {
    return { ok: false as const, reason: 'invalid' as const }
  }
}

export function toGuestSafeAvailability(value: {
  status: string
  available: boolean
  dates: Array<{ date: string; available: boolean }>
}): GuestSafeAvailability {
  return {
    status: value.status,
    available: value.available,
    informationalOnly: true,
    dates: value.dates.map(({ date, available }) => ({ date, available })),
  }
}

export function toGuestAvailabilityDto<
  T extends {
    fleetVehicle: unknown
    availability: Parameters<typeof toGuestSafeAvailability>[0]
  },
>(value: T) {
  const { fleetVehicle: _fleetVehicle, availability, ...safe } = value
  void _fleetVehicle
  return { ...safe, availability: toGuestSafeAvailability(availability), guest: true as const }
}

export function toGuestRideQuoteDto<
  T extends {
    quote: {
      fleetVehicle: unknown
      coupon: unknown
      availability: Parameters<typeof toGuestSafeAvailability>[0]
    }
  },
>(value: T) {
  const { fleetVehicle: _fleetVehicle, coupon: _coupon, availability, ...safeQuote } = value.quote
  void _fleetVehicle
  void _coupon
  return {
    quote: {
      ...safeQuote,
      availability: toGuestSafeAvailability(availability),
      coupon: null,
      informationalOnly: true as const,
      revalidationRequired: true as const,
    },
  }
}

export const guestTourQuoteSchema = z
  .object({
    tourIds: z
      .array(z.enum(['cotonou-city-tour', 'ouidah-tour', 'ganvie-tour']))
      .min(1)
      .max(3),
    vehicleCategoryId: z.string().trim().min(1).max(80),
    gogotinkpo: z.boolean().optional(),
    itineraryMode: z.enum(['standard', 'custom']).optional(),
    customItinerary: z.string().trim().min(10).max(4000).optional(),
    startDate: z.string().trim().min(1).max(40),
    pickup: z.object({
      label: z.string().trim().min(1).max(160),
      address: z.string().trim().min(1).max(300),
      coordinates: z.object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
      }),
    }),
    travellers: z.number().int().positive().max(50),
  })
  .strict()

export function guestNoStoreHeaders() {
  return { 'Cache-Control': 'private, no-store, max-age=0' }
}
