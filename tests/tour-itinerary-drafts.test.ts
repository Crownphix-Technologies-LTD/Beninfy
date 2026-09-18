import test from 'node:test'
import assert from 'node:assert/strict'
import {
  tourItinerarySchema,
  beninThreeDayDraft,
  itineraryDraftPayload,
  itineraryDraftFromDto,
  itineraryDraftErrors,
  readinessGuidance,
} from '../src/lib/admin/tourItineraryForm'
import {
  validateTourItineraryTemplate,
  tourExecutionReadiness,
  toTourItineraryDto,
  type TourWithItinerary,
} from '../src/lib/tourItinerary'

function draftStop(location: Record<string, unknown> = {}) {
  return {
    days: [
      {
        dayNumber: 1,
        title: 'Fixture day',
        stops: [{ sortOrder: 1, title: 'Fixture stop', ...location }],
      },
    ],
  }
}

test('draft save accepts omitted/null/blank locations and normalizes them to null, not zero', () => {
  for (const location of [
    {},
    { address: null, latitude: null, longitude: null },
    { address: ' ' },
  ]) {
    const parsed = tourItinerarySchema.parse(draftStop(location))
    const validated = validateTourItineraryTemplate(parsed.days)
    assert.ok(validated.ok)
    assert.equal(validated.days[0].stops[0].address, null)
    assert.equal(validated.days[0].stops[0].latitude, null)
    assert.equal(validated.days[0].stops[0].longitude, null)
  }
})

test('draft save rejects every partial, non-finite, out-of-range and address-less point', () => {
  for (const location of [
    { latitude: 1 },
    { longitude: 2 },
    { address: 'Synthetic address' },
    { latitude: 1, longitude: 2 },
    { address: ' ', latitude: 1, longitude: 2 },
    { address: 'Synthetic address', latitude: 1 },
    { address: 'Synthetic address', longitude: 2 },
    ...[NaN, Infinity, -91, 91, '1'].map((latitude) => ({
      address: 'Synthetic address',
      latitude,
      longitude: 2,
    })),
    ...[NaN, Infinity, -181, 181, '2'].map((longitude) => ({
      address: 'Synthetic address',
      latitude: 1,
      longitude,
    })),
  ])
    assert.equal(tourItinerarySchema.safeParse(draftStop(location)).success, false)
})

test('complete location preserves valid zero coordinates and an actual address', () => {
  const parsed = tourItinerarySchema.parse(
    draftStop({ address: 'Synthetic address', latitude: 0, longitude: 0 })
  )
  const validated = validateTourItineraryTemplate(parsed.days)
  assert.ok(validated.ok)
  assert.equal(validated.days[0].stops[0].latitude, 0)
  assert.equal(validated.days[0].stops[0].longitude, 0)
})

test('draft catalogue DTO preserves names, ordering and null locations; editor reload permits resaving', () => {
  const parsed = tourItinerarySchema.parse(itineraryDraftPayload([beninThreeDayDraft()[0]]))
  const validated = validateTourItineraryTemplate(parsed.days)
  assert.ok(validated.ok)
  const tour = {
    itineraryDays: validated.days.map((day) => ({
      ...day,
      id: 'day',
      titleFr: null,
      description: null,
      descriptionFr: null,
      defaultStartLabel: null,
      defaultStartAddress: null,
      defaultStartLatitude: null,
      defaultStartLongitude: null,
      defaultEndLabel: null,
      defaultEndAddress: null,
      defaultEndLatitude: null,
      defaultEndLongitude: null,
      stops: day.stops.map((stop, index) => ({
        ...stop,
        id: String(index),
        titleFr: null,
        description: null,
        descriptionFr: null,
        estimatedDurationMinutes: null,
      })),
    })),
  } satisfies TourWithItinerary
  assert.deepEqual(tourExecutionReadiness(tour), {
    executionReady: false,
    reason: 'missing_stop_coordinates',
  })
  const dto = toTourItineraryDto(tour)
  assert.deepEqual(
    dto[0].stops.map((stop) => stop.title),
    ['Graffiti Wall', 'Amazon Statue', 'Art Market', 'Abandoned Plane', 'Cornetto']
  )
  assert.ok(
    dto[0].stops.every(
      (stop) => stop.address === null && stop.latitude === null && stop.longitude === null
    )
  )
  assert.deepEqual(itineraryDraftErrors(itineraryDraftFromDto(dto)), [])
  assert.equal(
    readinessGuidance({
      tourId: 'fixture',
      updatedAt: new Date().toISOString(),
      itineraryDays: dto,
      executionReady: false,
      executionReadinessReason: 'missing_stop_coordinates',
    }),
    '5 stops still need locations.'
  )
})
