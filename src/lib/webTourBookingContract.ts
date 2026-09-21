import { z } from 'zod'
import { tourPickupSchema } from '@/lib/mobile/tourPickup'
import { CANONICAL_TOUR_IDS } from '@/lib/tourCommercial'

export const webTourBookingSchema = z
  .object({
    tourIds: z.array(z.enum(CANONICAL_TOUR_IDS)).min(1).max(3),
    vehicleCategoryId: z.string().trim().min(1).max(80),
    gogotinkpo: z.boolean().default(false),
    itineraryMode: z.enum(['standard', 'custom']).default('standard'),
    customItinerary: z.string().trim().min(10).max(4000).optional(),
    startDate: z.string().trim(),
    pickup: tourPickupSchema,
    travellers: z.number().int(),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.itineraryMode === 'custom' && !input.customItinerary) {
      ctx.addIssue({
        code: 'custom',
        path: ['customItinerary'],
        message: 'Describe the custom itinerary',
      })
    }
    if (input.itineraryMode === 'standard' && input.customItinerary) {
      ctx.addIssue({
        code: 'custom',
        path: ['customItinerary'],
        message: 'Choose custom itinerary mode',
      })
    }
  })
