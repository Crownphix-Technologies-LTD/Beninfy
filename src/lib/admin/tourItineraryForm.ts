import { z } from 'zod'
import {
  validTourCoordinate,
  validateTourItineraryTemplate,
  type TourItineraryDayDto,
  type TourExecutionReadiness,
} from '@/lib/tourItinerary'

const stopSchema = z.object({
  addonCode: z.enum(['gogotinkpo']).nullable().optional(),
  sortOrder: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  titleFr: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(1200).nullable().optional(),
  descriptionFr: z.string().trim().max(1200).nullable().optional(),
  address: z.string().trim().min(1).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  estimatedDurationMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .nullable()
    .optional(),
  required: z.boolean().optional(),
})

const daySchema = z.object({
  dayNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  titleFr: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(1600).nullable().optional(),
  descriptionFr: z.string().trim().max(1600).nullable().optional(),
  defaultStartLabel: z.string().trim().max(160).nullable().optional(),
  defaultStartAddress: z.string().trim().max(300).nullable().optional(),
  defaultStartLatitude: z.number().min(-90).max(90).nullable().optional(),
  defaultStartLongitude: z.number().min(-180).max(180).nullable().optional(),
  defaultEndLabel: z.string().trim().max(160).nullable().optional(),
  defaultEndAddress: z.string().trim().max(300).nullable().optional(),
  defaultEndLatitude: z.number().min(-90).max(90).nullable().optional(),
  defaultEndLongitude: z.number().min(-180).max(180).nullable().optional(),
  stops: z.array(stopSchema).default([]),
})

export const tourItinerarySchema = z.object({
  days: z.array(daySchema).max(30),
  expectedUpdatedAt: z.iso.datetime().optional(),
})

export type ItineraryResponse = {
  tourId: string
  updatedAt: string
  itineraryDays: TourItineraryDayDto[]
  executionReady: boolean
  executionReadinessReason: TourExecutionReadiness['reason']
}
export type LocationDraft = { label: string; address: string; latitude: string; longitude: string }
export type StopDraft = {
  addonCode?: string | null
  key: string
  title: string
  titleFr: string
  description: string
  descriptionFr: string
  location: LocationDraft
  estimatedDurationMinutes: string
  required: boolean
}
export type DayDraft = {
  key: string
  title: string
  titleFr: string
  description: string
  descriptionFr: string
  start: LocationDraft
  end: LocationDraft
  stops: StopDraft[]
}
export const emptyLocation = (): LocationDraft => ({
  label: '',
  address: '',
  latitude: '',
  longitude: '',
})
export const newStop = (title = ''): StopDraft => ({
  key: crypto.randomUUID(),
  title,
  titleFr: '',
  description: '',
  descriptionFr: '',
  location: emptyLocation(),
  estimatedDurationMinutes: '',
  required: true,
})
export const newDay = (title = ''): DayDraft => ({
  key: crypto.randomUUID(),
  title,
  titleFr: '',
  description: '',
  descriptionFr: '',
  start: emptyLocation(),
  end: emptyLocation(),
  stops: [],
})

// Names only. Operations must select every real stop and pickup location.
export function beninThreeDayDraft(): DayDraft[] {
  return [
    {
      title: 'Cotonou City Tour',
      stops: ['Graffiti Wall', 'Amazon Statue', 'Art Market', 'Abandoned Plane', 'Cornetto'],
    },
    {
      title: 'Ouidah Tour',
      stops: [
        'Point of No Return',
        'Zinsou Foundation',
        'Python Temple / Snake Temple',
        'Casa del Papa',
      ],
    },
    { title: 'Ganvié', stops: ['Village on Water', 'Babs Dock'] },
  ].map(({ title, stops }) => ({ ...newDay(title), stops: stops.map(newStop) }))
}

export function moveItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function locationFromDto(input: {
  label?: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
}): LocationDraft {
  return {
    label: input.label ?? '',
    address: input.address ?? '',
    latitude: input.latitude == null ? '' : String(input.latitude),
    longitude: input.longitude == null ? '' : String(input.longitude),
  }
}

export function itineraryDraftFromDto(days: TourItineraryDayDto[]): DayDraft[] {
  return [...days]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day) => ({
      key: day.id,
      title: day.title,
      titleFr: day.titleFr ?? '',
      description: day.description ?? '',
      descriptionFr: day.descriptionFr ?? '',
      start: locationFromDto(day.defaultStart),
      end: locationFromDto(day.defaultEnd),
      stops: [...day.stops]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((stop) => ({
          key: stop.id,
          title: stop.title,
          titleFr: stop.titleFr ?? '',
          description: stop.description ?? '',
          descriptionFr: stop.descriptionFr ?? '',
          location: locationFromDto(stop),
          required: stop.required,
          addonCode: stop.addonCode ?? null,
          estimatedDurationMinutes:
            stop.estimatedDurationMinutes == null ? '' : String(stop.estimatedDurationMinutes),
        })),
    }))
}

export function locationHasCoordinates(location: LocationDraft) {
  return (
    location.latitude.trim() !== '' &&
    location.longitude.trim() !== '' &&
    validTourCoordinate(Number(location.latitude), Number(location.longitude))
  )
}

const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value))

export function itineraryDraftPayload(days: DayDraft[]) {
  return {
    days: days.map((day, dayIndex) => ({
      dayNumber: dayIndex + 1,
      title: day.title,
      titleFr: day.titleFr,
      description: day.description,
      descriptionFr: day.descriptionFr,
      defaultStartLabel: day.start.label,
      defaultStartAddress: day.start.address,
      defaultStartLatitude: optionalNumber(day.start.latitude),
      defaultStartLongitude: optionalNumber(day.start.longitude),
      defaultEndLabel: day.end.label,
      defaultEndAddress: day.end.address,
      defaultEndLatitude: optionalNumber(day.end.latitude),
      defaultEndLongitude: optionalNumber(day.end.longitude),
      stops: day.stops.map((stop, stopIndex) => ({
        sortOrder: stopIndex + 1,
        title: stop.title,
        titleFr: stop.titleFr,
        description: stop.description,
        descriptionFr: stop.descriptionFr,
        address: stop.location.address,
        latitude: optionalNumber(stop.location.latitude),
        longitude: optionalNumber(stop.location.longitude),
        estimatedDurationMinutes: optionalNumber(stop.estimatedDurationMinutes),
        required: stop.required,
        addonCode: stop.addonCode || null,
      })),
    })),
  }
}

export function itineraryDraftErrors(days: DayDraft[]) {
  const errors: string[] = []
  days.forEach((day, d) => {
    for (const [name, location] of [
      ['pickup', day.start],
      ['end', day.end],
    ] as const) {
      const hasAny = Object.values(location).some((value) => value.trim())
      if (
        hasAny &&
        (!location.label.trim() || !location.address.trim() || !locationHasCoordinates(location))
      ) {
        errors.push(
          'Day ' +
            (d + 1) +
            ': complete the ' +
            name +
            ' label, address and coordinates, or clear it.'
        )
      }
    }
    day.stops.forEach((stop, s) => {
      if (!locationHasCoordinates(stop.location))
        errors.push(
          'Day ' + (d + 1) + ', Stop ' + (s + 1) + ': select a location with valid coordinates.'
        )
    })
  })
  const parsed = tourItinerarySchema.safeParse(itineraryDraftPayload(days))
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const p = issue.path
      const where = p[0] === 'days' && typeof p[1] === 'number' ? 'Day ' + (p[1] + 1) : 'Itinerary'
      const stop = p[2] === 'stops' && typeof p[3] === 'number' ? ', Stop ' + (p[3] + 1) : ''
      errors.push(where + stop + ' — ' + String(p.at(-1)) + ': ' + issue.message)
    }
  } else {
    const result = validateTourItineraryTemplate(parsed.data.days)
    if (!result.ok)
      errors.push('Check day/stop ordering and complete both coordinates for each location.')
  }
  return [...new Set(errors)]
}

export function readinessGuidance(response: ItineraryResponse) {
  switch (response.executionReadinessReason) {
    case 'invalid_canonical_day_count':
      return 'This Tour must have exactly one itinerary day.'
    case 'ready':
      return 'The saved itinerary meets the booking requirements.'
    case 'no_itinerary_days':
      return 'Add at least one day and its stops, then save the itinerary.'
    case 'missing_day_stop': {
      const day = response.itineraryDays.find((day) => day.stops.length === 0)
      return 'Day ' + (day?.dayNumber ?? '') + ' has no stops. Add a stop with its actual location.'
    }
    case 'missing_stop_coordinates': {
      const day = response.itineraryDays.find((day) =>
        day.stops.some((stop) => !validTourCoordinate(stop.latitude, stop.longitude))
      )
      return (
        'Day ' +
        (day?.dayNumber ?? '') +
        ' contains a stop without valid coordinates. Select its actual location.'
      )
    }
  }
}
