import { z } from 'zod'

// Same coordinate shape as the existing Tour day pickup DTO. No geocoding here.
export const tourPickupSchema = z.object({
  label: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(300),
  coordinates: z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  }),
})

export type TourPickup = z.infer<typeof tourPickupSchema>

export function tourPickupSnapshot(pickup: TourPickup) {
  return {
    pickupLabel: pickup.label,
    pickupAddress: pickup.address,
    pickupLatitude: pickup.coordinates.latitude,
    pickupLongitude: pickup.coordinates.longitude,
  }
}
