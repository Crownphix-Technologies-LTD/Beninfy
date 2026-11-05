import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getPlaceLocation } from '../src/lib/googleMaps'

test('web Ride booking requires authoritative selected-place coordinates', () => {
  const booking = readFileSync('src/app/[locale]/rides/book/page.tsx', 'utf8')

  assert.match(booking, /else if \(!pickupCoordinates\)/)
  assert.match(booking, /Select a pickup address from the search suggestions/)
  assert.match(booking, /else if \(!dropoffCoordinates\)/)
  assert.match(booking, /Select a drop-off address from the search suggestions/)
})

test('web Ride booking restores selected-place coordinates on back navigation', () => {
  const booking = readFileSync('src/app/[locale]/rides/book/page.tsx', 'utf8')

  assert.match(
    booking,
    /parseCoordinates\(params\.get\('pickupLatitude'\), params\.get\('pickupLongitude'\)\)/
  )
  assert.match(
    booking,
    /parseCoordinates\(params\.get\('dropoffLatitude'\), params\.get\('dropoffLongitude'\)\)/
  )
})

test('web Ride booking preserves authoritative Google city and country metadata', () => {
  assert.deepEqual(
    getPlaceLocation({
      address_components: [
        { long_name: 'Cotonou', short_name: 'Cotonou', types: ['locality'] },
        { long_name: 'Benin', short_name: 'BJ', types: ['country'] },
      ],
    }),
    { city: 'Cotonou', country: 'Benin', countryCode: 'BJ' }
  )

  const booking = readFileSync('src/app/[locale]/rides/book/page.tsx', 'utf8')
  const payment = readFileSync('src/app/[locale]/rides/pay/page.tsx', 'utf8')
  assert.match(booking, /destinationCountryCode: dropoffLocation\.current\.countryCode/)
  assert.match(payment, /destinationCountryCode,/)
})

test('admin booking collection route exports only supported Next route handlers', () => {
  const route = readFileSync('src/app/api/admin/bookings/route.ts', 'utf8')

  assert.match(route, /export async function GET/)
  assert.match(route, /export async function PATCH/)
  assert.doesNotMatch(route, /export \{ patchSchema \}/)
})

test('Ride confirmation keeps browser-only print behavior behind a Client boundary', () => {
  const confirmation = readFileSync('src/app/[locale]/rides/confirmed/page.tsx', 'utf8')
  const printButton = readFileSync('src/components/booking/PrintReceiptButton.tsx', 'utf8')

  assert.doesNotMatch(confirmation, /onClick=\{\(\) => window\.print\(\)\}/)
  assert.match(confirmation, /<PrintReceiptButton/)
  assert.match(printButton, /^'use client'/)
})
