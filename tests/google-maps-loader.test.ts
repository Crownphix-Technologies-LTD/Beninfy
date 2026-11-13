import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  GOOGLE_MAPS_CALLBACK_NAME,
  GoogleMapsLoadError,
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

test('map preview exposes safe diagnostics and no technical customer-facing failure copy', () => {
  const source = fs.readFileSync('src/components/booking/AddressMapPreview.tsx', 'utf8')
  assert.match(source, /GOOGLE_MAPS_DIAGNOSTIC_EVENT/)
  assert.match(source, /component: 'address_preview'/)
  assert.doesNotMatch(source, /Map preview unavailable/)
  assert.doesNotMatch(source, /Google Maps failed/)
  assert.doesNotMatch(source, /API key/)
})

test('verified fallback requires both authoritative coordinates and selected address text', () => {
  const source = fs.readFileSync('src/components/booking/AddressMapPreview.tsx', 'utf8')
  assert.match(source, /pickup && pickupAddress\?\.trim\(\)/)
  assert.match(source, /dropoff && dropoffAddress\?\.trim\(\)/)
  assert.match(source, /verifiedLocations\.length > 0/)
  assert.match(source, /Your verified selection is saved/)
  assert.match(source, /Votre sélection vérifiée est enregistrée/)
  assert.match(source, /md:h-\[260px\]/)
})

test('Maps loader classifies authorization failures without exposing credentials', () => {
  const source = fs.readFileSync('src/lib/googleMaps.ts', 'utf8')
  assert.match(source, /new GoogleMapsLoadError\('authorization'\)/)
  assert.match(source, /googleMapsAuthFailureListeners\.forEach/)
  assert.equal(new GoogleMapsLoadError('authorization').code, 'authorization')
  assert.doesNotMatch(new GoogleMapsLoadError('authorization').message, /browser-key|AIza/)
})

test('Maps loader times out instead of remaining pending indefinitely', async () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const listeners = new Map<string, () => void>()
  const script = {
    id: '',
    src: '',
    async: false,
    defer: false,
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setTimeout,
      clearTimeout,
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      getElementById: () => null,
      createElement: () => script,
      head: { appendChild: () => undefined },
    },
  })

  try {
    await assert.rejects(
      loadGoogleMaps('browser-key', { timeoutMs: 1 }),
      (error: unknown) => error instanceof GoogleMapsLoadError && error.code === 'timeout'
    )
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
  }
})
