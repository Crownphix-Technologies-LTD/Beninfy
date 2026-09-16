import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import TourItineraryEditor from '../src/components/admin/TourItineraryEditor'
import { adminRoleCan } from '../src/lib/roles'
import {
  beninThreeDayDraft,
  itineraryDraftFromDto,
  itineraryDraftPayload,
  itineraryDraftErrors,
  moveItem,
  newDay,
  newStop,
  readinessGuidance,
  tourItinerarySchema,
  type ItineraryResponse,
} from '../src/lib/admin/tourItineraryForm'
import {
  tourExecutionReadiness,
  validTourCoordinate,
  validateTourItineraryTemplate,
  toTourItineraryDto,
} from '../src/lib/tourItinerary'

function fixture() {
  // Deliberately synthetic test data. Never used as real destination coordinates.
  return {
    itineraryDays: [1, 2, 3].map((dayNumber) => ({
      id: 'test-day-' + dayNumber,
      dayNumber,
      title: 'Fixture day ' + dayNumber,
      titleFr: null,
      description: null,
      descriptionFr: null,
      defaultStartLabel: 'Fixture pickup',
      defaultStartAddress: 'Test address',
      defaultStartLatitude: 0,
      defaultStartLongitude: 0,
      defaultEndLabel: null,
      defaultEndAddress: null,
      defaultEndLatitude: null,
      defaultEndLongitude: null,
      stops: [1, 2].map((sortOrder) => ({
        id: 'test-stop-' + dayNumber + '-' + sortOrder,
        sortOrder,
        title: 'Fixture stop ' + sortOrder,
        titleFr: null,
        description: null,
        descriptionFr: null,
        address: 'Test address',
        latitude: 1,
        longitude: 1,
        estimatedDurationMinutes: null,
        required: true,
      })),
    })),
  }
}

test('three-day Benin outline contains requested ordered names and no invented locations', () => {
  const days = beninThreeDayDraft()
  assert.deepEqual(
    days.map((day) => day.title),
    ['Cotonou City Tour', 'Ouidah Tour', 'Ganvié']
  )
  assert.deepEqual(
    days.map((day) => day.stops.map((stop) => stop.title)),
    [
      ['Graffiti Wall', 'Amazon Statue', 'Art Market', 'Abandoned Plane', 'Cornetto'],
      ['Point of No Return', 'Zinsou Foundation', 'Python Temple / Snake Temple', 'Casa del Papa'],
      ['Village on Water', 'Babs Dock'],
    ]
  )
  for (const day of days)
    for (const location of [day.start, day.end, ...day.stops.map((stop) => stop.location)]) {
      assert.equal(location.latitude, '')
      assert.equal(location.longitude, '')
      assert.equal(location.address, '')
    }
  assert.ok(itineraryDraftErrors(days).some((error) => error.includes('select a location')))
  assert.equal(tourItinerarySchema.safeParse(itineraryDraftPayload(days)).success, false)
})

test('move-up/down preserves identity and saves contiguous day and stop ordering without IDs', () => {
  const original = itineraryDraftFromDto(toTourItineraryDto(fixture()))
  const reordered = moveItem(original, 2, -1)
  reordered[0] = { ...reordered[0], stops: moveItem(reordered[0].stops, 0, 1) }
  const payload = itineraryDraftPayload(reordered)
  assert.deepEqual(
    payload.days.map((day) => day.dayNumber),
    [1, 2, 3]
  )
  assert.deepEqual(
    payload.days.map((day) => day.title),
    ['Fixture day 1', 'Fixture day 3', 'Fixture day 2']
  )
  assert.deepEqual(
    payload.days[0].stops.map((stop) => stop.title),
    ['Fixture stop 2', 'Fixture stop 1']
  )
  assert.deepEqual(
    payload.days[0].stops.map((stop) => stop.sortOrder),
    [1, 2]
  )
  assert.equal('id' in payload.days[0], false)
  assert.equal('key' in payload.days[0].stops[0], false)
  assert.equal(moveItem(original, 0, -1), original)
})

test('coordinates reject null, undefined, non-finite and out-of-range values without coercing blanks to zero', () => {
  for (const latitude of [null, undefined, NaN, Infinity, -91, 91, '0']) {
    assert.equal(validTourCoordinate(latitude as number, 0), false)
  }
  assert.equal(validTourCoordinate(0, 181), false)
  assert.equal(validTourCoordinate(0, 0), true)
  const day = newDay('Fixture day')
  day.stops = [newStop('Fixture stop')]
  assert.equal(itineraryDraftPayload([day]).days[0].stops[0].latitude, null)
  assert.ok(itineraryDraftErrors([day]).length)
})

test('backend readiness reports missing day, missing stop, invalid stop coordinates and fully ready', () => {
  assert.deepEqual(tourExecutionReadiness({ itineraryDays: [] }), {
    executionReady: false,
    reason: 'no_itinerary_days',
  })
  const tour = fixture()
  tour.itineraryDays[1].stops = []
  assert.deepEqual(tourExecutionReadiness(tour), {
    executionReady: false,
    reason: 'missing_day_stop',
  })
  const missing = fixture()
  missing.itineraryDays[1].stops[0].latitude = null as unknown as number
  assert.deepEqual(tourExecutionReadiness(missing), {
    executionReady: false,
    reason: 'missing_stop_coordinates',
  })
  assert.deepEqual(tourExecutionReadiness(fixture()), { executionReady: true, reason: 'ready' })
})

test('default pickup remains separate from Stop 1 and optional end stays empty on round-trip serialization', () => {
  const dto = toTourItineraryDto(fixture())
  const draft = itineraryDraftFromDto(dto)
  assert.deepEqual(itineraryDraftErrors(draft), [])
  const payload = itineraryDraftPayload(draft)
  assert.equal(payload.days[0].defaultStartLatitude, 0)
  assert.equal(payload.days[0].stops[0].latitude, 1)
  assert.equal(payload.days[0].defaultEndLatitude, null)
  draft[0].start.latitude = ''
  assert.ok(itineraryDraftErrors(draft).some((message) => message.includes('pickup')))
})

test('save rejects malformed days/stops, duplicate ordering and partial optional coordinates', () => {
  const payload = itineraryDraftPayload(itineraryDraftFromDto(toTourItineraryDto(fixture())))
  const parsed = tourItinerarySchema.parse(payload)
  assert.equal(validateTourItineraryTemplate(parsed.days).ok, true)
  assert.equal(
    tourItinerarySchema.safeParse({ days: [{ dayNumber: 1, title: '', stops: [] }] }).success,
    false
  )
  parsed.days[0].stops[0].estimatedDurationMinutes = -1
  assert.equal(tourItinerarySchema.safeParse(parsed).success, false)
  parsed.days[0].stops[0].estimatedDurationMinutes = 20
  parsed.days[1].dayNumber = 1
  assert.equal(validateTourItineraryTemplate(parsed.days).ok, false)
  parsed.days[1].dayNumber = 2
  parsed.days[0].defaultStartLongitude = null
  assert.equal(validateTourItineraryTemplate(parsed.days).ok, false)
})

test('readiness guidance names the affected day instead of exposing raw enums', () => {
  const response: ItineraryResponse = {
    tourId: 'test',
    updatedAt: new Date().toISOString(),
    itineraryDays: toTourItineraryDto(fixture()),
    executionReady: false,
    executionReadinessReason: 'missing_day_stop',
  }
  response.itineraryDays[1].stops = []
  assert.match(readinessGuidance(response), /Day 2 has no stops/)
})

test('itinerary reads and writes require tours permission before accessing data', () => {
  for (const role of ['user', 'driver', 'finance_admin', 'support_admin'])
    assert.equal(adminRoleCan(role, 'tours'), false)
  for (const role of ['admin', 'operations_admin', 'content_admin'])
    assert.equal(adminRoleCan(role, 'tours'), true)
  const source = readFileSync('src/app/api/admin/tours/[id]/itinerary/route.ts', 'utf8')
  for (const method of ['GET', 'PUT']) {
    const handler = source.slice(source.indexOf('export async function ' + method))
    assert.ok(handler.indexOf("requireAdminPermission('tours')") < handler.indexOf('const { id }'))
    assert.ok(handler.includes('if (!guard.ok) return guard.response'))
  }
})

test('visual editor renders saved readiness, three ordered days, stop counts, fixed price and pickup guidance', () => {
  const initial: ItineraryResponse = {
    tourId: 'test',
    updatedAt: new Date().toISOString(),
    itineraryDays: toTourItineraryDto(fixture()),
    executionReady: true,
    executionReadinessReason: 'ready',
  }
  const html = renderEditor(initial)
  assert.match(html, /Ready for booking/)
  assert.match(html, /Day 3 of 3/)
  assert.match(html, /Stop 2 of 2/)
  assert.match(html, /Not multiplied by traveller count/)
  assert.match(html, /Default pickup is separate from Stop 1/)
  assert.match(html, /Save Changes/)
  assert.doesNotMatch(html, /Make execution ready/)
})

function renderEditor(initial: ItineraryResponse) {
  const router = {
    push() {},
    replace() {},
    refresh() {},
    back() {},
    forward() {},
    prefetch: async () => {},
  }
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router },
      createElement(TourItineraryEditor, {
        locale: 'en',
        tour: { id: 'test', title: 'Fixture tour', durationDays: 3, startingFromNGN: 120000 },
        initial,
      })
    )
  )
}

test('opening a configured itinerary preserves its saved days and never offers the starter', () => {
  const initial: ItineraryResponse = {
    tourId: 'test',
    updatedAt: new Date().toISOString(),
    itineraryDays: toTourItineraryDto(fixture()),
    executionReady: true,
    executionReadinessReason: 'ready',
  }
  const before = structuredClone(initial)
  const html = renderEditor(initial)
  for (const day of initial.itineraryDays) {
    assert.ok(html.includes(day.title))
    for (const stop of day.stops) assert.ok(html.includes(stop.title))
  }
  assert.doesNotMatch(html, /Use 3-day Benin itinerary/)
  assert.doesNotMatch(html, /Cotonou City Tour|Ouidah Tour|Graffiti Wall|Village on Water/)
  assert.deepEqual(initial, before)
})

test('opening an empty itinerary offers a deliberate starter action without inserting days', () => {
  const initial: ItineraryResponse = {
    tourId: 'test',
    updatedAt: new Date().toISOString(),
    itineraryDays: [],
    executionReady: false,
    executionReadinessReason: 'no_itinerary_days',
  }
  const html = renderEditor(initial)
  assert.match(html, /Use 3-day Benin itinerary \(names only\)/)
  assert.doesNotMatch(html, /Day 1 of 3|Cotonou City Tour|Graffiti Wall|Village on Water/)
  assert.deepEqual(initial.itineraryDays, [])
})
