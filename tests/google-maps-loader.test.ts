import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  GOOGLE_MAPS_CALLBACK_NAME,
  googleMapsScriptUrl,
  loadGoogleMaps,
} from '../src/lib/googleMaps'

test('Maps loader requests only the browser Maps SDK with deterministic async initialization', () => {
  const url = new URL(googleMapsScriptUrl('browser-key'))
  assert.equal(url.origin, 'https://maps.googleapis.com')
  assert.equal(url.pathname, '/maps/api/js')
  assert.equal(url.searchParams.get('key'), 'browser-key')
  assert.equal(url.searchParams.get('loading'), 'async')
  assert.equal(url.searchParams.get('callback'), GOOGLE_MAPS_CALLBACK_NAME)
  assert.equal(url.searchParams.has('libraries'), false)
})

test('Maps loader accepts an initialized Maps SDK without requiring legacy Places', async () => {
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { google: { maps: { Map: class Map {} } } },
  })

  try {
    await assert.doesNotReject(loadGoogleMaps('browser-key'))
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
  }
})

test('map preview keeps authoritative marker refresh and viewport behavior', () => {
  const source = fs.readFileSync('src/components/booking/AddressMapPreview.tsx', 'utf8')
  assert.match(source, /markersRef\.current\.forEach\(\(marker\) => marker\.setMap\(null\)\)/)
  assert.match(source, /position: pickup/)
  assert.match(source, /position: dropoff/)
  assert.match(source, /map\.fitBounds\(bounds, 72\)/)
  assert.match(source, /map\.setCenter\(singleLocation\)/)
  assert.match(source, /\[dropoff, from, pickup, status, to\]/)
})
