import type { Prisma } from '@prisma/client'

type Dateish = Date | string

export type TourItineraryStopInput = {
  id?: string
  sortOrder: number
  title: string
  titleFr?: string | null
  description?: string | null
  descriptionFr?: string | null
  address: string
  latitude: number
  longitude: number
  estimatedDurationMinutes?: number | null
  required?: boolean
}

export type TourItineraryDayInput = {
  id?: string
  dayNumber: number
  title: string
  titleFr?: string | null
  description?: string | null
  descriptionFr?: string | null
  defaultStartLabel?: string | null
  defaultStartAddress?: string | null
  defaultStartLatitude?: number | null
  defaultStartLongitude?: number | null
  defaultEndLabel?: string | null
  defaultEndAddress?: string | null
  defaultEndLatitude?: number | null
  defaultEndLongitude?: number | null
  stops: TourItineraryStopInput[]
}

export type TourItineraryStopDto = {
  id: string
  sortOrder: number
  title: string
  titleFr: string | null
  description: string | null
  descriptionFr: string | null
  address: string
  latitude: number
  longitude: number
  estimatedDurationMinutes: number | null
  required: boolean
}

export type TourItineraryDayDto = {
  id: string
  dayNumber: number
  title: string
  titleFr: string | null
  description: string | null
  descriptionFr: string | null
  defaultStart: {
    label: string | null
    address: string | null
    latitude: number | null
    longitude: number | null
  }
  defaultEnd: {
    label: string | null
    address: string | null
    latitude: number | null
    longitude: number | null
  }
  stops: TourItineraryStopDto[]
}

export type TourExecutionReadiness = {
  executionReady: boolean
  reason: 'ready' | 'no_itinerary_days' | 'missing_day_stop' | 'missing_stop_coordinates'
}

export type TourWithItinerary = {
  itineraryDays: Array<
    {
      id: string
      dayNumber: number
      title: string
      titleFr: string | null
      description: string | null
      descriptionFr: string | null
      defaultStartLabel: string | null
      defaultStartAddress: string | null
      defaultStartLatitude: number | null
      defaultStartLongitude: number | null
      defaultEndLabel: string | null
      defaultEndAddress: string | null
      defaultEndLatitude: number | null
      defaultEndLongitude: number | null
      createdAt?: Dateish
      updatedAt?: Dateish
      stops: Array<{
        id: string
        sortOrder: number
        title: string
        titleFr: string | null
        description: string | null
        descriptionFr: string | null
        address: string
        latitude: number
        longitude: number
        estimatedDurationMinutes: number | null
        required: boolean
        createdAt?: Dateish
        updatedAt?: Dateish
      }>
    }
  >
}

export function validTourCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
  )
}

function hasCompleteOptionalCoordinatePair(latitude?: number | null, longitude?: number | null) {
  if (latitude == null && longitude == null) return true
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false
  return validTourCoordinate(latitude, longitude)
}

export function normalizeTourItineraryInput(days: TourItineraryDayInput[]) {
  return [...days]
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .map((day) => ({
      ...day,
      title: day.title.trim(),
      titleFr: day.titleFr?.trim() || null,
      description: day.description?.trim() || null,
      descriptionFr: day.descriptionFr?.trim() || null,
      defaultStartLabel: day.defaultStartLabel?.trim() || null,
      defaultStartAddress: day.defaultStartAddress?.trim() || null,
      defaultEndLabel: day.defaultEndLabel?.trim() || null,
      defaultEndAddress: day.defaultEndAddress?.trim() || null,
      stops: [...day.stops]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((stop) => ({
          ...stop,
          title: stop.title.trim(),
          titleFr: stop.titleFr?.trim() || null,
          description: stop.description?.trim() || null,
          descriptionFr: stop.descriptionFr?.trim() || null,
          address: stop.address.trim(),
          required: stop.required ?? true,
        })),
    }))
}

export function validateTourItineraryTemplate(days: TourItineraryDayInput[]) {
  const seenDays = new Set<number>()
  for (const day of days) {
    if (!Number.isInteger(day.dayNumber) || day.dayNumber < 1) {
      return { ok: false as const, code: 'INVALID_DAY_NUMBER' as const }
    }
    if (seenDays.has(day.dayNumber)) {
      return { ok: false as const, code: 'DUPLICATE_DAY_NUMBER' as const }
    }
    seenDays.add(day.dayNumber)
    if (!day.title.trim()) return { ok: false as const, code: 'DAY_TITLE_REQUIRED' as const }
    if (
      !hasCompleteOptionalCoordinatePair(day.defaultStartLatitude, day.defaultStartLongitude) ||
      !hasCompleteOptionalCoordinatePair(day.defaultEndLatitude, day.defaultEndLongitude)
    ) {
      return { ok: false as const, code: 'INVALID_DAY_COORDINATES' as const }
    }

    const seenStops = new Set<number>()
    for (const stop of day.stops) {
      if (!Number.isInteger(stop.sortOrder) || stop.sortOrder < 1) {
        return { ok: false as const, code: 'INVALID_STOP_ORDER' as const }
      }
      if (seenStops.has(stop.sortOrder)) {
        return { ok: false as const, code: 'DUPLICATE_STOP_ORDER' as const }
      }
      seenStops.add(stop.sortOrder)
      if (!stop.title.trim()) return { ok: false as const, code: 'STOP_TITLE_REQUIRED' as const }
      if (!stop.address.trim()) return { ok: false as const, code: 'STOP_ADDRESS_REQUIRED' as const }
      if (!validTourCoordinate(stop.latitude, stop.longitude)) {
        return { ok: false as const, code: 'INVALID_STOP_COORDINATES' as const }
      }
    }
  }

  return { ok: true as const, days: normalizeTourItineraryInput(days) }
}

export function tourExecutionReadiness(tour: TourWithItinerary): TourExecutionReadiness {
  if (tour.itineraryDays.length === 0) {
    return { executionReady: false, reason: 'no_itinerary_days' }
  }
  if (tour.itineraryDays.some((day) => day.stops.length === 0)) {
    return { executionReady: false, reason: 'missing_day_stop' }
  }
  const missingCoordinates = tour.itineraryDays.some((day) =>
    day.stops.some((stop) => !validTourCoordinate(stop.latitude, stop.longitude))
  )
  if (missingCoordinates) {
    return { executionReady: false, reason: 'missing_stop_coordinates' }
  }
  return { executionReady: true, reason: 'ready' }
}

export function toTourItineraryDto(tour: TourWithItinerary): TourItineraryDayDto[] {
  return [...tour.itineraryDays]
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      title: day.title,
      titleFr: day.titleFr,
      description: day.description,
      descriptionFr: day.descriptionFr,
      defaultStart: {
        label: day.defaultStartLabel,
        address: day.defaultStartAddress,
        latitude: day.defaultStartLatitude,
        longitude: day.defaultStartLongitude,
      },
      defaultEnd: {
        label: day.defaultEndLabel,
        address: day.defaultEndAddress,
        latitude: day.defaultEndLatitude,
        longitude: day.defaultEndLongitude,
      },
      stops: [...day.stops]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((stop) => ({
          id: stop.id,
          sortOrder: stop.sortOrder,
          title: stop.title,
          titleFr: stop.titleFr,
          description: stop.description,
          descriptionFr: stop.descriptionFr,
          address: stop.address,
          latitude: stop.latitude,
          longitude: stop.longitude,
          estimatedDurationMinutes: stop.estimatedDurationMinutes,
          required: stop.required,
        })),
    }))
}

export function tourItineraryCreateData(days: TourItineraryDayInput[]): Prisma.TourItineraryDayCreateWithoutTourInput[] {
  const validated = validateTourItineraryTemplate(days)
  if (!validated.ok) return []
  return validated.days.map((day) => ({
    dayNumber: day.dayNumber,
    title: day.title,
    titleFr: day.titleFr,
    description: day.description,
    descriptionFr: day.descriptionFr,
    defaultStartLabel: day.defaultStartLabel,
    defaultStartAddress: day.defaultStartAddress,
    defaultStartLatitude: day.defaultStartLatitude ?? null,
    defaultStartLongitude: day.defaultStartLongitude ?? null,
    defaultEndLabel: day.defaultEndLabel,
    defaultEndAddress: day.defaultEndAddress,
    defaultEndLatitude: day.defaultEndLatitude ?? null,
    defaultEndLongitude: day.defaultEndLongitude ?? null,
    stops: {
      create: day.stops.map((stop) => ({
        sortOrder: stop.sortOrder,
        title: stop.title,
        titleFr: stop.titleFr,
        description: stop.description,
        descriptionFr: stop.descriptionFr,
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        estimatedDurationMinutes: stop.estimatedDurationMinutes ?? null,
        required: stop.required,
      })),
    },
  }))
}
