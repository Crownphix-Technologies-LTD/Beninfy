'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Compass,
  Info,
  MapPin,
  Route,
  Sparkles,
  Users,
} from 'lucide-react'
import AddressAutocomplete from '@/components/booking/AddressAutocomplete'
import CatalogImage from '@/components/shared/CatalogImage'
import { getPlaceCoordinates } from '@/lib/googleMaps'

type Tour = {
  id: string
  title: string
  titleFr?: string | null
  description: string
  descriptionFr?: string | null
  image: string
  transportationOnly: boolean
  gogotinkpoAvailable: boolean
  executionReady: boolean
  itineraryDays: Array<{
    id: string
    stops: Array<{ id: string; title: string; titleFr?: string | null; addonCode?: string | null }>
  }>
}

type VehicleCategory = {
  id: string
  name: string
  nameFr?: string | null
  capacity: number
  pricingCategory: string
  pricePerTour: { value: number; currency: string }
}

type Quote = {
  totalDays: number
  quoteRequired: boolean
  pricing: null | { priceNGN: number; components: Array<{ tourId: string; totalMinor: number }> }
  standardEstimate: null | { priceNGN: number }
}

type Props = {
  locale: string
  tours: Tour[]
  vehicleCategories: VehicleCategory[]
  signedIn: boolean
}

const text = {
  en: {
    eyebrow: 'CURATED BENIN EXPERIENCES',
    title: 'Build your private Tour',
    subtitle:
      'Choose one or more experiences. One vehicle, one booking and one payment cover the full itinerary.',
    chooseTours: 'Choose your Tours',
    chooseVehicle: 'Choose a vehicle',
    tripDetails: 'Trip details',
    standard: 'Standard itinerary',
    custom: 'Custom itinerary',
    customHelp: 'Operations will review your request and approve a final quote before payment.',
    customPlaceholder: 'Describe the stops, timing or special arrangements you need.',
    pickup: 'Pickup in Cotonou',
    pickupPlaceholder: 'Search your hotel, landmark or address in Cotonou',
    pickupHelp: 'Select a Google result. Tour pickups outside Cotonou are not accepted.',
    date: 'First Tour date',
    travellers: 'Travellers',
    addon: 'Add Gogotinkpo',
    addonHelp: 'Adds 20% to the Cotonou City Tour component only.',
    transportOnly: 'Transportation only',
    unavailable: 'Itinerary being configured',
    perTour: 'per selected Tour',
    review: 'Review price',
    create: 'Confirm booking',
    signIn: 'Sign in to confirm',
    summary: 'Booking summary',
    selected: 'selected',
    total: 'Total',
    estimate: 'Standard estimate',
    quotePending: 'Operations quote required',
    noPrice: 'Complete your choices to see the authoritative price.',
  },
  fr: {
    eyebrow: 'EXPÉRIENCES PRIVÉES AU BÉNIN',
    title: 'Composez votre circuit privé',
    subtitle:
      'Choisissez une ou plusieurs expériences. Un véhicule, une réservation et un paiement couvrent tout le programme.',
    chooseTours: 'Choisissez vos circuits',
    chooseVehicle: 'Choisissez un véhicule',
    tripDetails: 'Détails du voyage',
    standard: 'Itinéraire standard',
    custom: 'Itinéraire personnalisé',
    customHelp: "L'équipe d'exploitation étudiera votre demande avant d'approuver le prix final.",
    customPlaceholder: 'Décrivez les étapes, horaires ou dispositions particulières souhaitées.',
    pickup: 'Prise en charge à Cotonou',
    pickupPlaceholder: 'Recherchez votre hôtel, un lieu ou une adresse à Cotonou',
    pickupHelp:
      'Sélectionnez un résultat Google. Les départs hors de Cotonou ne sont pas acceptés.',
    date: 'Date du premier circuit',
    travellers: 'Voyageurs',
    addon: 'Ajouter Gogotinkpo',
    addonHelp: 'Ajoute 20 % uniquement au prix du circuit de Cotonou.',
    transportOnly: 'Transport uniquement',
    unavailable: 'Itinéraire en cours de configuration',
    perTour: 'par circuit sélectionné',
    review: 'Vérifier le prix',
    create: 'Confirmer la réservation',
    signIn: 'Se connecter pour confirmer',
    summary: 'Résumé de la réservation',
    selected: 'sélectionné(s)',
    total: 'Total',
    estimate: 'Estimation standard',
    quotePending: 'Devis Operations requis',
    noPrice: 'Complétez vos choix pour voir le prix officiel.',
  },
} as const

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value)
}

function errorMessage(payload: unknown) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: { message?: string; code?: string } }).error
    return error?.message || error?.code || 'Could not complete this request.'
  }
  return 'Could not complete this request.'
}

export default function TourBookingExperience({
  locale,
  tours,
  vehicleCategories,
  signedIn,
}: Props) {
  const router = useRouter()
  const l = locale === 'fr' ? 'fr' : 'en'
  const t = text[l]
  const [tourIds, setTourIds] = useState<string[]>([])
  const [vehicleId, setVehicleId] = useState('')
  const [mode, setMode] = useState<'standard' | 'custom'>('standard')
  const [customItinerary, setCustomItinerary] = useState('')
  const [gogotinkpo, setGogotinkpo] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [travellers, setTravellers] = useState(1)
  const [pickup, setPickup] = useState({ label: '', address: '', latitude: NaN, longitude: NaN })
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedTours = useMemo(
    () => tours.filter((tour) => tourIds.includes(tour.id)),
    [tourIds, tours]
  )
  const selectedVehicle = vehicleCategories.find((vehicle) => vehicle.id === vehicleId)
  const hasCoordinates = Number.isFinite(pickup.latitude) && Number.isFinite(pickup.longitude)
  const standardReady = mode === 'custom' || selectedTours.every((tour) => tour.executionReady)
  const canReview = Boolean(
    tourIds.length &&
    vehicleId &&
    startDate &&
    hasCoordinates &&
    standardReady &&
    travellers <= (selectedVehicle?.capacity ?? 0) &&
    (mode === 'standard' || customItinerary.trim().length >= 10)
  )

  useEffect(() => {
    const saved = sessionStorage.getItem('beninfy-tour-draft')
    if (!saved) return
    try {
      const draft = JSON.parse(saved) as Partial<{
        tourIds: string[]
        vehicleId: string
        mode: 'standard' | 'custom'
        customItinerary: string
        gogotinkpo: boolean
        startDate: string
        travellers: number
        pickup: typeof pickup
      }>
      const restore = window.setTimeout(() => {
        if (draft.tourIds) setTourIds(draft.tourIds)
        if (draft.vehicleId) setVehicleId(draft.vehicleId)
        if (draft.mode) setMode(draft.mode)
        if (draft.customItinerary) setCustomItinerary(draft.customItinerary)
        if (draft.gogotinkpo) setGogotinkpo(true)
        if (draft.startDate) setStartDate(draft.startDate)
        if (draft.travellers) setTravellers(draft.travellers)
        if (draft.pickup) setPickup(draft.pickup)
      }, 0)
      return () => window.clearTimeout(restore)
    } catch {
      sessionStorage.removeItem('beninfy-tour-draft')
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem(
      'beninfy-tour-draft',
      JSON.stringify({
        tourIds,
        vehicleId,
        mode,
        customItinerary,
        gogotinkpo,
        startDate,
        travellers,
        pickup,
      })
    )
    const invalidate = window.setTimeout(() => setQuote(null), 0)
    return () => window.clearTimeout(invalidate)
  }, [tourIds, vehicleId, mode, customItinerary, gogotinkpo, startDate, travellers, pickup])

  const requestBody = () => ({
    tourIds,
    vehicleCategoryId: vehicleId,
    gogotinkpo,
    itineraryMode: mode,
    ...(mode === 'custom' ? { customItinerary: customItinerary.trim() } : {}),
    startDate,
    travellers,
    pickup: {
      label: pickup.label || pickup.address,
      address: pickup.address,
      coordinates: { latitude: pickup.latitude, longitude: pickup.longitude },
    },
  })

  async function review() {
    if (!canReview) return
    setLoading(true)
    setError(null)
    const response = await fetch('/api/tour-bookings/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)
    if (!response.ok) return setError(errorMessage(payload))
    setQuote((payload as { quote: Quote }).quote)
  }

  async function createBooking() {
    if (!quote) return
    if (!signedIn) {
      router.push(`/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/tours`)}`)
      return
    }
    setLoading(true)
    setError(null)
    const response = await fetch('/api/tour-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody(), idempotencyKey: crypto.randomUUID() }),
    })
    const payload = await response.json().catch(() => null)
    setLoading(false)
    if (!response.ok) return setError(errorMessage(payload))
    const id = (payload as { tourBooking: { id: string } }).tourBooking.id
    sessionStorage.removeItem('beninfy-tour-draft')
    router.push(`/${locale}/tours/bookings/${id}`)
  }

  return (
    <main className="min-h-screen bg-[#f7f6f8] pt-16 text-[#201a22]">
      <section className="border-b border-[#e4dfe6] bg-white">
        <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-10 md:py-14">
          <p className="text-primary text-xs font-bold uppercase">{t.eyebrow}</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-bold md:text-5xl">{t.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#675d69] md:text-base">
            {t.subtitle}
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-8 md:px-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-10">
          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">
                1
              </span>
              <h2 className="text-xl font-bold">{t.chooseTours}</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {tours.map((tour) => {
                const selected = tourIds.includes(tour.id)
                const name = l === 'fr' ? tour.titleFr || tour.title : tour.title
                const stops = tour.itineraryDays[0]?.stops.filter((stop) => !stop.addonCode) ?? []
                return (
                  <button
                    type="button"
                    key={tour.id}
                    aria-pressed={selected}
                    onClick={() => {
                      setTourIds((current) =>
                        selected ? current.filter((id) => id !== tour.id) : [...current, tour.id]
                      )
                      if (tour.id === 'cotonou-city-tour' && selected) setGogotinkpo(false)
                    }}
                    className={`overflow-hidden rounded-lg border bg-white text-left transition ${selected ? 'border-primary ring-primary/15 ring-2' : 'hover:border-primary/50 border-[#ddd6df]'}`}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <CatalogImage
                        src={tour.image}
                        alt={name}
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="h-full w-full object-cover"
                      />
                      <span
                        className={`absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-white' : 'border-white/70 bg-white/90 text-transparent'}`}
                      >
                        <Check size={17} />
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold">{name}</h3>
                        {tour.transportationOnly && (
                          <span className="rounded bg-[#f5e8c8] px-2 py-1 text-[10px] font-bold text-[#6c4d00]">
                            {t.transportOnly}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#675d69]">
                        {l === 'fr' ? tour.descriptionFr || tour.description : tour.description}
                      </p>
                      <p className="text-primary mt-3 flex items-center gap-1.5 text-xs font-semibold">
                        <Route size={14} /> {stops.length} stops
                      </p>
                      {!tour.executionReady && mode === 'standard' && (
                        <p className="mt-2 text-xs font-semibold text-amber-700">{t.unavailable}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            {tourIds.includes('cotonou-city-tour') &&
              tours.find((tour) => tour.id === 'cotonou-city-tour')?.gogotinkpoAvailable && (
                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[#ddd6df] bg-white p-4">
                  <input
                    type="checkbox"
                    checked={gogotinkpo}
                    onChange={(event) => setGogotinkpo(event.target.checked)}
                    className="accent-primary mt-1 h-4 w-4"
                  />
                  <Sparkles className="text-primary mt-0.5" size={18} />
                  <span>
                    <strong className="block text-sm">{t.addon}</strong>
                    <span className="text-xs text-[#675d69]">{t.addonHelp}</span>
                  </span>
                </label>
              )}
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">
                2
              </span>
              <h2 className="text-xl font-bold">{t.chooseVehicle}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {vehicleCategories.map((vehicle) => {
                const selected = vehicle.id === vehicleId
                return (
                  <button
                    type="button"
                    key={vehicle.id}
                    onClick={() => setVehicleId(vehicle.id)}
                    className={`flex min-h-24 items-center justify-between rounded-lg border bg-white p-4 text-left ${selected ? 'border-primary ring-primary/15 ring-2' : 'border-[#ddd6df]'}`}
                  >
                    <span>
                      <strong className="block">
                        {l === 'fr' ? vehicle.nameFr || vehicle.name : vehicle.name}
                      </strong>
                      <span className="mt-1 flex items-center gap-1 text-xs text-[#675d69]">
                        <Users size={14} /> Up to {vehicle.capacity}
                      </span>
                    </span>
                    <span className="text-right">
                      <strong className="text-primary block">
                        {money(vehicle.pricePerTour.value, locale)}
                      </strong>
                      <span className="text-[11px] text-[#675d69]">{t.perTour}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">
                3
              </span>
              <h2 className="text-xl font-bold">{t.tripDetails}</h2>
            </div>
            <div className="space-y-5 rounded-lg border border-[#ddd6df] bg-white p-5 md:p-6">
              <div className="grid grid-cols-2 rounded-lg bg-[#f3eff4] p-1">
                {(['standard', 'custom'] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setMode(item)}
                    className={`min-h-11 rounded-md px-3 text-sm font-semibold ${mode === item ? 'text-primary bg-white shadow-sm' : 'text-[#675d69]'}`}
                  >
                    {item === 'standard' ? t.standard : t.custom}
                  </button>
                ))}
              </div>
              {mode === 'custom' && (
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">{t.custom}</span>
                  <textarea
                    value={customItinerary}
                    onChange={(event) => setCustomItinerary(event.target.value)}
                    placeholder={t.customPlaceholder}
                    rows={4}
                    className="focus:border-primary focus:ring-primary/15 w-full resize-y rounded-lg border border-[#cfc6d1] px-3 py-3 text-sm outline-none focus:ring-2"
                  />
                  <span className="mt-2 flex gap-2 text-xs text-[#675d69]">
                    <Info size={14} className="shrink-0" />
                    {t.customHelp}
                  </span>
                </label>
              )}
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">{t.pickup}</span>
                <AddressAutocomplete
                  value={pickup.address}
                  onChange={(address) =>
                    setPickup((current) => ({ ...current, address, latitude: NaN, longitude: NaN }))
                  }
                  onPlaceSelected={(address, place) => {
                    const point = getPlaceCoordinates(place)
                    setPickup({
                      label: place.name || address,
                      address,
                      latitude: point?.lat ?? NaN,
                      longitude: point?.lng ?? NaN,
                    })
                  }}
                  placeholder={t.pickupPlaceholder}
                  icon="location_on"
                  iconColor="#3e004c"
                  inputClassName="h-12 w-full rounded-lg border border-[#cfc6d1] bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  helperText={t.pickupHelp}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays size={16} />
                    {t.date}
                  </span>
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="focus:border-primary h-12 w-full rounded-lg border border-[#cfc6d1] px-3 text-sm outline-none"
                  />
                </label>
                <label>
                  <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Users size={16} />
                    {t.travellers}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={Math.min(30, selectedVehicle?.capacity ?? 30)}
                    value={travellers}
                    onChange={(event) => setTravellers(Number(event.target.value))}
                    className="focus:border-primary h-12 w-full rounded-lg border border-[#cfc6d1] px-3 text-sm outline-none"
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-lg border border-[#ddd6df] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">{t.summary}</h2>
            <div className="mt-5 space-y-4 border-b border-[#ebe6ec] pb-5 text-sm">
              <div className="flex items-start gap-3">
                <Compass size={17} className="text-primary mt-0.5" />
                <span>
                  <strong>
                    {tourIds.length} {t.selected}
                  </strong>
                  <span className="mt-1 block text-xs text-[#675d69]">
                    {selectedTours
                      .map((tour) => (l === 'fr' ? tour.titleFr || tour.title : tour.title))
                      .join(' · ') || '—'}
                  </span>
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Users size={17} className="text-primary mt-0.5" />
                <span>
                  <strong>
                    {selectedVehicle
                      ? l === 'fr'
                        ? selectedVehicle.nameFr || selectedVehicle.name
                        : selectedVehicle.name
                      : '—'}
                  </strong>
                  <span className="mt-1 block text-xs text-[#675d69]">
                    {travellers} {t.travellers.toLowerCase()}
                  </span>
                </span>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={17} className="text-primary mt-0.5" />
                <span className="line-clamp-2">{pickup.address || '—'}</span>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 size={17} className="text-primary mt-0.5" />
                <span>{startDate || '—'}</span>
              </div>
            </div>
            <div className="py-5">
              {quote ? (
                <div className="flex items-end justify-between gap-3">
                  <span className="text-sm text-[#675d69]">
                    {quote.quoteRequired ? t.estimate : t.total}
                  </span>
                  <strong className="text-primary text-2xl">
                    {money(
                      quote.pricing?.priceNGN ?? quote.standardEstimate?.priceNGN ?? 0,
                      locale
                    )}
                  </strong>
                </div>
              ) : (
                <p className="text-xs leading-5 text-[#675d69]">{t.noPrice}</p>
              )}
              {quote?.quoteRequired && (
                <p className="mt-2 rounded-md bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                  {t.quotePending}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {!quote ? (
              <button
                type="button"
                disabled={!canReview || loading}
                onClick={review}
                className="bg-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? '...' : t.review}
                <ChevronRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={createBooking}
                className="bg-primary flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 font-semibold text-white disabled:opacity-50"
              >
                {loading ? '...' : signedIn ? t.create : t.signIn}
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}
