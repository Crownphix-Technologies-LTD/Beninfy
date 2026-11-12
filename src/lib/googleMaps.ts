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
export const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-sdk'
export const GOOGLE_MAPS_CALLBACK_NAME = '__beninfyGoogleMapsReady'

let googleMapsLoader: Promise<void> | null = null
let googleMapsAuthFailed = false

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
  if (googleWindow.gm_authFailure) return

  googleWindow.gm_authFailure = () => {
    googleMapsAuthFailed = true
    googleMapsLoader = null
    window.dispatchEvent(new CustomEvent(GOOGLE_MAPS_AUTH_FAILURE_EVENT))
  }
}

export function loadGoogleMaps(apiKey: string) {
  const googleWindow = window as GoogleMapsWindow
  installGoogleMapsAuthFailureHandler()
  if (googleMapsAuthFailed) return Promise.reject(new Error('Google Maps API key was rejected'))
  if (googleWindow.google?.maps?.Map) return Promise.resolve()
  if (googleMapsLoader) return googleMapsLoader

  googleMapsLoader = new Promise<void>((resolve, reject) => {
    const callbackWindow = window as GoogleMapsWindow & Record<string, unknown>
    const finish = () => {
      if (googleMapsAuthFailed || !googleWindow.google?.maps?.Map) {
        googleMapsLoader = null
        reject(new Error('Google Maps failed to initialize'))
        return
      }
      resolve()
    }
    callbackWindow[GOOGLE_MAPS_CALLBACK_NAME] = finish

    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null

    if (existing) {
      if (googleWindow.google?.maps?.Map) {
        resolve()
        return
      }
      existing.addEventListener('load', finish, { once: true })
      existing.addEventListener(
        'error',
        () => {
          googleMapsLoader = null
          reject(new Error('Google Maps failed to load'))
        },
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
      () => {
        googleMapsLoader = null
        reject(new Error('Google Maps failed to load'))
      },
      { once: true }
    )
    document.head.appendChild(script)
  })

  return googleMapsLoader
}
