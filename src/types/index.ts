export type Locale = 'en' | 'fr'

export type TripType = 'one-way' | 'round-trip'

export type VehicleId = string

export type RouteId = string

export type ServiceType = 'ride' | 'airport' | 'tour' | 'vip' | 'fleet'

export interface PriceRange {
  min: number
  max: number
}

export interface Route {
  id: RouteId
  canonicalRouteId?: RouteId
  pricingRouteId?: RouteId
  sourceRouteId?: RouteId
  direction?: 'explicit' | 'reverse_projection'
  from: string
  fromCode: string
  fromCountry: string
  to: string
  toCode: string
  toCountry: string
  durationHours: number
  available?: boolean
  popular: boolean
  image: string
  description: string
  descriptionFr: string
  borderCrossings: string[]
  borderFeeIds?: string[]
}

export interface Vehicle {
  id: VehicleId
  name: string
  nameFr: string
  capacity: number
  luggageCapacity: number
  features: string[]
  featuresFr: string[]
  image: string
  description: string
  descriptionFr: string
  available: boolean
  basePriceNGN?: number | null
  badge?: string
  badgeFr?: string
}

export interface Tour {
  id: string
  title: string
  titleFr: string
  destination: string
  destinationFr: string
  country: string
  countryFr?: string | null
  durationDays: number
  startingFromNGN: number
  image: string
  description: string
  descriptionFr: string
  highlights: string[]
  highlightsFr: string[]
  included: string[]
  includedFr: string[]
}

export interface BorderFee {
  id: string
  country: string
  countryFr: string
  border: string
  borderFr: string
  countries: [string, string]
  feePerPersonNGN: number
  feeRoundTripNGN: number
  services: string[]
  servicesFr: string[]
  documents: string[]
  documentsFr: string[]
  tips: string[]
  tipsFr: string[]
  popular?: boolean
  icon: string
}

export interface BookingFormData {
  from: string
  to: string
  date: string
  returnDate?: string
  passengers: number
  tripType: TripType
  vehicleId: VehicleId
}

export interface NavItem {
  href: string
  label: string
  labelFr?: string
}

export interface Stat {
  value: string
  label: string
  labelFr: string
}

export interface Stat {
  value: string
  label: string
}
