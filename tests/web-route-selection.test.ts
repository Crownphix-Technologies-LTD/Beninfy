import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  isRouteEndpointCompatible,
  routeDestinations,
  routeForCityPair,
  routeForOriginChange,
  routeForSelection,
  routeOrigins,
  type WebRouteDto,
} from '../src/lib/webRouteSelection'

const routes: WebRouteDto[] = [
  route('lagos-cotonou', 'Lagos', 'Cotonou', 'lagos-cotonou', 'explicit'),
  route('lagos-cotonou__reverse', 'Cotonou', 'Lagos', 'lagos-cotonou', 'reverse_projection'),
  route('cotonou-accra', 'Cotonou', 'Accra', 'cotonou-accra', 'explicit'),
]

function route(
  id: string,
  origin: string,
  destination: string,
  pricingRouteId: string,
  direction: WebRouteDto['direction']
): WebRouteDto {
  return {
    id,
    canonicalRouteId: pricingRouteId,
    pricingRouteId,
    direction,
    origin: { city: origin, code: origin.slice(0, 3), country: 'Country' },
    destination: { city: destination, code: destination.slice(0, 3), country: 'Country' },
    displayName: `${origin} to ${destination}`,
    durationHours: 3,
    popular: false,
    image: '',
    description: '',
    descriptionFr: '',
    borderCrossings: [],
    available: true,
  }
}

test('web route selection consumes explicit and reverse backend projections', () => {
  assert.deepEqual(routeOrigins(routes), ['Cotonou', 'Lagos'])
  assert.deepEqual(routeDestinations(routes, 'cotonou'), ['Accra', 'Lagos'])
  assert.equal(routeForCityPair(routes, 'Lagos', 'Cotonou')?.id, 'lagos-cotonou')
  assert.equal(routeForCityPair(routes, 'Cotonou', 'Lagos')?.id, 'lagos-cotonou__reverse')
  assert.equal(routeForCityPair(routes, 'Cotonou', 'Lagos')?.pricingRouteId, 'lagos-cotonou')
})

test('web route selection does not invent an unsupported reverse direction', () => {
  assert.equal(routeForCityPair(routes, 'Accra', 'Cotonou'), undefined)
})

test('directional route identity overrides stale or same-city query labels', () => {
  const reverse = routeForSelection(
    routes,
    'lagos-cotonou__reverse',
    'Cotonou',
    'Cotonou'
  )
  assert.equal(reverse?.origin.city, 'Cotonou')
  assert.equal(reverse?.destination.city, 'Lagos')
  assert.equal(reverse?.pricingRouteId, 'lagos-cotonou')
  assert.equal(isRouteEndpointCompatible('Cotonou', reverse?.origin.city ?? ''), true)
  assert.equal(isRouteEndpointCompatible('Cotonou', reverse?.destination.city ?? ''), false)
})

test('normal and reverse selections remain stable through repeated swaps', () => {
  const forward = routeForSelection(routes, 'lagos-cotonou', 'Cotonou', 'Lagos')
  const reverse = routeForSelection(routes, 'lagos-cotonou__reverse', 'Lagos', 'Cotonou')
  assert.deepEqual(
    [forward?.origin.city, forward?.destination.city, reverse?.origin.city, reverse?.destination.city],
    ['Lagos', 'Cotonou', 'Cotonou', 'Lagos']
  )
  assert.equal(forward?.pricingRouteId, reverse?.pricingRouteId)
})

test('homepage origin changes atomically select the matching directional route', () => {
  const forward = routeForCityPair(routes, 'Lagos', 'Cotonou')
  const reverse = routeForOriginChange(routes, forward, 'Cotonou')
  const forwardAgain = routeForOriginChange(routes, reverse, 'Lagos')

  assert.deepEqual(
    [reverse?.id, reverse?.origin.city, reverse?.destination.city],
    ['lagos-cotonou__reverse', 'Cotonou', 'Lagos']
  )
  assert.deepEqual(
    [forwardAgain?.id, forwardAgain?.origin.city, forwardAgain?.destination.city],
    ['lagos-cotonou', 'Lagos', 'Cotonou']
  )
  assert.equal(forwardAgain?.pricingRouteId, reverse?.pricingRouteId)
})

test('homepage booking widget derives both cities and navigation from one route id', () => {
  const homepageWidget = fs.readFileSync('src/components/booking/BookingWidget.tsx', 'utf8')

  assert.match(homepageWidget, /const \[selectedRouteId, setSelectedRouteId\] = useState\(''\)/)
  assert.doesNotMatch(homepageWidget, /const \[from, setFrom\]/)
  assert.doesNotMatch(homepageWidget, /const \[to, setTo\]/)
  assert.match(homepageWidget, /routeId: selectedRoute\.id/)
  assert.match(homepageWidget, /from: selectedRoute\.origin\.city/)
  assert.match(homepageWidget, /to: selectedRoute\.destination\.city/)
})

test('web booking preserves directional identity and rejects a stale direction', () => {
  const rides = fs.readFileSync('src/app/[locale]/rides/page.tsx', 'utf8')
  const booking = fs.readFileSync('src/app/api/bookings/route.ts', 'utf8')
  const payment = fs.readFileSync('src/app/[locale]/rides/pay/page.tsx', 'utf8')
  const details = fs.readFileSync('src/app/[locale]/rides/book/page.tsx', 'utf8')
  assert.match(rides, /routeId=.*matchedRoute\.id/)
  assert.match(payment, /routeId: matchedRoute\.id/)
  assert.match(payment, /const from = matchedRoute\?\.origin\.city/)
  assert.match(payment, /const to = matchedRoute\?\.destination\.city/)
  assert.match(details, /pickupCompatible \? \{\} : \{ pickupAddress: '' \}/)
  assert.match(details, /dropoffCompatible \? \{\} : \{ dropoffAddress: '' \}/)
  assert.match(booking, /ROUTE_DIRECTION_MISMATCH/)
  assert.match(booking, /data\.routeId !== matchedRoute\.id/)
})
