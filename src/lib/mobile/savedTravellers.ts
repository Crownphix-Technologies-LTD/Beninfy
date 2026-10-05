import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => value || null)

export const savedTravellerCreateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(5).max(32),
    email: z
      .union([z.string().trim().email().max(254), z.literal(''), z.null()])
      .optional()
      .transform((value) => value?.toLowerCase() || null),
    label: optionalText(60),
  })
  .strict()

export const savedTravellerUpdateSchema = savedTravellerCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export function normalizeSavedTravellerPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, '')
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact

  if (/^\+[1-9]\d{6,14}$/.test(international)) return international
  if (/^0\d{10}$/.test(international)) return `+234${international.slice(1)}`
  return null
}

export type SavedTravellerDtoInput = {
  id: string
  fullName: string
  phone: string
  email: string | null
  label: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

export function toSavedTravellerDto(traveller: SavedTravellerDtoInput) {
  return {
    id: traveller.id,
    fullName: traveller.fullName,
    phone: traveller.phone,
    email: traveller.email,
    label: traveller.label,
    createdAt: new Date(traveller.createdAt).toISOString(),
    updatedAt: new Date(traveller.updatedAt).toISOString(),
  }
}
