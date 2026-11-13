'use client'

export type LatLngLiteral = {
  lat: number
  lng: number
}

export type GooglePlaceResult = {
  formatted_address?: string
  name?: string
  place_id?: string
  address_components?: Array<{
    long_name: string
    short_name: string
    types: string[]
  }>
  geometry?: {
    location?: {
      lat: () => number
      lng: () => number
    }
  }
}

export type GooglePlaceLocation = {
  city: string | null
  country: string | null
  countryCode: string | null
}

export type MapsAutocomplete = {
  addListener: (eventName: 'place_changed', handler: () => void) => { remove?: () => void }
  getPlace: () => GooglePlaceResult
}

export type GoogleMapsWindow = Window & {
  __beninfyGoogleMapsReady?: () => void
  gm_authFailure?: () => void
  google?: {
    maps?: {
      LatLngBounds: new () => {
        extend: (location: LatLngLiteral) => void
      }
      Map: new (
        element: HTMLElement,
        options: {
          center: LatLngLiteral
          zoom: number
          disableDefaultUI?: boolean
          clickableIcons?: boolean
          gestureHandling?: string
          styles?: Array<Record<string, unknown>>
        }
      ) => {
        fitBounds: (bounds: { extend: (location: LatLngLiteral) => void }, padding?: number) => void
        setCenter: (center: LatLngLiteral) => void
        setZoom: (zoom: number) => void
      }
      Marker: new (options: {
        map: unknown
        position: LatLngLiteral
        title?: string
        label?: string
        icon?: {
          path: number
          scale: number
          fillColor: string
          fillOpacity: number
          strokeColor: string
          strokeWeight: number
        }
      }) => {
        setMap: (map: unknown | null) => void
      }
      SymbolPath: {
        CIRCLE: number
      }
      places?: {
        Autocomplete: new (
          input: HTMLInputElement,
          options: {
            fields: string[]
            componentRestrictions?: { country: string[] }
          }
        ) => MapsAutocomplete
      }
    }
  }
}

export const GOOGLE_MAPS_AUTH_FAILURE_EVENT = 'beninfy:google-maps-auth-failure'
export const GOOGLE_MAPS_DIAGNOSTIC_EVENT = 'beninfy:google-maps-diagnostic'
export const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-sdk'
export const GOOGLE_MAPS_CALLBACK_NAME = '__beninfyGoogleMapsReady'
export const GOOGLE_MAPS_LOAD_TIMEOUT_MS = 10000

export type GoogleMapsFailureCode =
  | 'configuration'
  | 'authorization'
  | 'sdk_load'
  | 'timeout'
  | 'initialization'

export class GoogleMapsLoadError extends Error {
  constructor(public readonly code: GoogleMapsFailureCode) {
    super(`Google Maps loader failed: ${code}`)
    this.name = 'GoogleMapsLoadError'
  }
}

let googleMapsLoader: Promise<void> | null = null
let googleMapsAuthFailed = false
let googleMapsTerminalError: GoogleMapsLoadError | null = null
const googleMapsAuthFailureListeners = new Set<() => void>()

export function getGoogleMaps() {
  return (window as GoogleMapsWindow).google?.maps
}

export function getPlaceCoordinates(place: GooglePlaceResult): LatLngLiteral | null {
  const location = place.geometry?.location
  if (!location) return null
  return {
    lat: location.lat(),
    lng: location.lng(),
  }
}

export function getPlaceLocation(place: GooglePlaceResult): GooglePlaceLocation {
  const components = place.address_components ?? []
  const city = components.find((component) =>
    component.types.some((type) =>
      ['locality', 'postal_town', 'administrative_area_level_2', 'administrative_area_level_1'].includes(type)
    )
  )
  const country = components.find((component) => component.types.includes('country'))
  return {
    city: city?.long_name ?? null,
    country: country?.long_name ?? null,
    countryCode: country?.short_name?.toUpperCase() ?? null,
  }
}

export function hasGoogleMapsAuthFailed() {
  return googleMapsAuthFailed
}

export function googleMapsScriptUrl(apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    loading: 'async',
    callback: GOOGLE_MAPS_CALLBACK_NAME,
  })
  return `https://maps.googleapis.com/maps/api/js?${params}`
}

function installGoogleMapsAuthFailureHandler() {
  const googleWindow = window as GoogleMapsWindow
  const previousHandler = googleWindow.gm_authFailure
  if (previousHandler?.name === 'beninfyGoogleMapsAuthFailure') return

  googleWindow.gm_authFailure = function beninfyGoogleMapsAuthFailure() {
    googleMapsAuthFailed = true
    googleMapsTerminalError = new GoogleMapsLoadError('authorization')
    window.dispatchEvent(new CustomEvent(GOOGLE_MAPS_AUTH_FAILURE_EVENT))
    googleMapsAuthFailureListeners.forEach((listener) => listener())
    previousHandler?.()
  }
}

export function loadGoogleMaps(
  apiKey: string,
  options: { timeoutMs?: number } = {}
) {
  const googleWindow = window as GoogleMapsWindow
  installGoogleMapsAuthFailureHandler()
  if (googleWindow.google?.maps?.Map) return Promise.resolve()
  if (googleMapsAuthFailed) return Promise.reject(new GoogleMapsLoadError('authorization'))
  if (googleMapsTerminalError) return Promise.reject(googleMapsTerminalError)
  if (googleMapsLoader) return googleMapsLoader

  googleMapsLoader = new Promise<void>((resolve, reject) => {
    let settled = false
    const timeoutMs = options.timeoutMs ?? GOOGLE_MAPS_LOAD_TIMEOUT_MS
    const settle = (error?: GoogleMapsLoadError) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      googleMapsAuthFailureListeners.delete(handleAuthorizationFailure)
      if (error) {
        googleMapsTerminalError = error
        reject(error)
      } else {
        resolve()
      }
    }
    const handleAuthorizationFailure = () => settle(new GoogleMapsLoadError('authorization'))
    const finish = () => {
      if (googleMapsAuthFailed) return settle(new GoogleMapsLoadError('authorization'))
      if (!googleWindow.google?.maps?.Map) return
      settle()
    }
    const timeout = window.setTimeout(
      () => settle(new GoogleMapsLoadError('timeout')),
      timeoutMs
    )
    googleMapsAuthFailureListeners.add(handleAuthorizationFailure)
    googleWindow.__beninfyGoogleMapsReady = finish

    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null

    if (existing) {
      if (googleWindow.google?.maps?.Map) {
        resolve()
        return
      }
      existing.addEventListener('load', finish, { once: true })
      existing.addEventListener(
        'error',
        () => settle(new GoogleMapsLoadError('sdk_load')),
        { once: true }
      )
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_MAPS_SCRIPT_ID
    script.src = googleMapsScriptUrl(apiKey)
    script.async = true
    script.defer = true
    script.addEventListener('load', finish, { once: true })
    script.addEventListener(
      'error',
      () => settle(new GoogleMapsLoadError('sdk_load')),
      { once: true }
    )
    document.head.appendChild(script)
  })

  return googleMapsLoader
}
