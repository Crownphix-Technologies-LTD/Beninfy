'use client'

export type LatLngLiteral = {
  lat: number
  lng: number
}

export type GooglePlaceResult = {
  formatted_address?: string
  name?: string
  place_id?: string
  geometry?: {
    location?: {
      lat: () => number
      lng: () => number
    }
  }
}

export type MapsAutocomplete = {
  addListener: (eventName: 'place_changed', handler: () => void) => { remove?: () => void }
  getPlace: () => GooglePlaceResult
}

export type GoogleMapsWindow = Window & {
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

let googleMapsLoader: Promise<void> | null = null

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

export function loadGoogleMaps(apiKey: string) {
  const googleWindow = window as GoogleMapsWindow
  if (googleWindow.google?.maps?.Map && googleWindow.google.maps.places?.Autocomplete) return Promise.resolve()
  if (googleMapsLoader) return googleMapsLoader

  googleMapsLoader = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('google-maps-places-sdk') as HTMLScriptElement | null

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = 'google-maps-places-sdk'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Google Maps failed to load')), { once: true })
    document.head.appendChild(script)
  })

  return googleMapsLoader
}
