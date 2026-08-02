'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { findRoute } from '@/data/routes'
import { getRouteDropoffPrice, requiresLagosPickupArea, type LagosPickupArea } from '@/data/pricing'
import { getRouteBorderFee } from '@/data/borderFees'
import { useVehicles } from '@/hooks/useVehicles'
import { useFleetVehicles } from '@/hooks/useFleetVehicles'
import { useRoutePriceOverrides } from '@/hooks/useRoutePriceOverrides'
import AddressAutocomplete from '@/components/booking/AddressAutocomplete'
import AddressMapPreview from '@/components/booking/AddressMapPreview'
import JourneyTracker from '@/components/booking/JourneyTracker'
import RouteMapSVG from '@/components/shared/RouteMapSVG'
import CountUp from 'react-countup'
import { getFleetVehicleDisplayLabel } from '@/lib/fleetDisplay'
import { getPlaceCoordinates, type LatLngLiteral, type GooglePlaceResult } from '@/lib/googleMaps'
import type { VehicleId, RouteId } from '@/types'

type TravelerDetails = {
  fullName: string
  phone: string
  passportId: string
  nationality: string
}

const INPUT_BASE =
  'w-full bg-white border rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all'
const INPUT_OK = INPUT_BASE + ' border-gray-200 focus:border-primary focus:ring-primary/20'
const INPUT_ERR = INPUT_BASE + ' border-red-400 focus:border-red-500 focus:ring-red-200'

const LAGOS_ISLAND_AREAS = [
  'lagos island',
  'victoria island',
  'ikoyi',
  'lekki',
  'ajah',
  'banana island',
  'oniru',
  'eko atlantic',
  'marina',
  'obalende',
]

const LAGOS_MAINLAND_AREAS = [
  'ikeja',
  'yaba',
  'surulere',
  'gbagada',
  'maryland',
  'ojota',
  'magodo',
  'ogba',
  'agege',
  'oshodi',
  'mushin',
  'festac',
  'apapa',
  'alimosho',
  'ikorodu',
  'ketu',
  'berger',
  'akoka',
  'ilupeju',
]

function inferLagosPickupArea(address: string): LagosPickupArea | null {
  const normalized = address.toLowerCase()
  if (LAGOS_ISLAND_AREAS.some((area) => normalized.includes(area))) return 'island'
  if (LAGOS_MAINLAND_AREAS.some((area) => normalized.includes(area))) return 'mainland'
  return null
}

function emptyTraveler(): TravelerDetails {
  return { fullName: '', phone: '', passportId: '', nationality: '' }
}

function parsePositiveInt(value: string | null, fallback = 1) {
  const parsed = parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseInitialTravelers(value: string | null, passengerCount: number): TravelerDetails[] {
  if (!value) return Array.from({ length: Math.max(0, passengerCount - 1) }, emptyTraveler)
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return Array.from({ length: Math.max(0, passengerCount - 1) }, emptyTraveler)
    const extras = parsed.slice(1).map((traveler) => ({
      fullName: typeof traveler?.fullName === 'string' ? traveler.fullName : '',
      phone: typeof traveler?.phone === 'string' ? traveler.phone : '',
      passportId: typeof traveler?.passportId === 'string' ? traveler.passportId : '',
      nationality: typeof traveler?.nationality === 'string' ? traveler.nationality : '',
    }))
    const expected = Math.max(0, passengerCount - 1)
    if (extras.length >= expected) return extras.slice(0, expected)
    return [...extras, ...Array.from({ length: expected - extras.length }, emptyTraveler)]
  } catch {
    return Array.from({ length: Math.max(0, passengerCount - 1) }, emptyTraveler)
  }
}

function PassengerDetailsContent() {
  const locale = useLocale()
  const t = useTranslations('bookPage')
  const router = useRouter()
  const params = useSearchParams()
  const { vehicles } = useVehicles()
  const { fleetVehicles } = useFleetVehicles()

  const vehicleId = (params.get('vehicle') ?? 'saloon') as VehicleId
  const fleetVehicleId = params.get('fleetVehicle') || ''
  const from = params.get('from') ?? 'Lagos'
  const to = params.get('to') ?? 'Cotonou'
  const date = params.get('date') ?? ''
  const returnDate = params.get('returnDate') ?? ''
  const tripType = params.get('tripType') === 'round-trip' ? 'round-trip' : 'one-way'
  const initialPickupArea = params.get('pickupArea')
  const initialPassengerCount = parsePositiveInt(params.get('passengers'))

  const vehicle = vehicles.find((v) => v.id === vehicleId)
  const fleetVehicle = fleetVehicles.find((unit) => unit.id === fleetVehicleId && unit.vehicleId === vehicleId)
  const vehicleDisplayName = fleetVehicle ? getFleetVehicleDisplayLabel(fleetVehicle.label) : vehicle?.name
  const vehicleCapacity = vehicle?.capacity ?? Math.max(initialPassengerCount, 1)
  const matchedRoute = findRoute(from, to)

  const [form, setForm] = useState({
    fullName: params.get('name') ?? '',
    email: params.get('email') ?? '',
    phone: params.get('phone') ?? '',
    passportId: params.get('passportId') ?? '',
    nationality: params.get('nationality') ?? '',
    specialRequirements: params.get('specialRequirements') ?? '',
    pickupAddress: params.get('pickupAddress') ?? '',
    dropoffAddress: params.get('dropoffAddress') ?? '',
  })
  const [errors, setErrors] = useState<Partial<typeof form>>({})
  const [passengerCount, setPassengerCount] = useState(initialPassengerCount)
  const [travelers, setTravelers] = useState<TravelerDetails[]>(() =>
    parseInitialTravelers(params.get('travelers'), initialPassengerCount)
  )
  const [travelerErrors, setTravelerErrors] = useState<Array<Partial<TravelerDetails>>>([])
  const [pickupArea, setPickupArea] = useState<LagosPickupArea | ''>(
    initialPickupArea === 'mainland' || initialPickupArea === 'island' ? initialPickupArea : ''
  )
  const [pickupCoordinates, setPickupCoordinates] = useState<LatLngLiteral | null>(null)
  const [dropoffCoordinates, setDropoffCoordinates] = useState<LatLngLiteral | null>(null)
  const [pickupAreaError, setPickupAreaError] = useState(false)

  const needsPickupArea = matchedRoute
    ? requiresLagosPickupArea(matchedRoute.id as RouteId, vehicleId, vehicle?.name)
    : false
  const { overrides } = useRoutePriceOverrides(matchedRoute?.id)
  const dropoffFare = matchedRoute
    ? getRouteDropoffPrice(
        matchedRoute.id as RouteId,
        (fleetVehicle?.id ?? vehicleId) as VehicleId,
        fleetVehicle?.label ?? vehicle?.name,
        pickupArea || undefined,
        overrides
      )
    : null

  const updateFormField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const set =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      updateFormField(field, e.target.value)

  const updatePickupAddress = (value: string) => {
    updateFormField('pickupAddress', value)
    setPickupCoordinates(null)
  }

  const updateDropoffAddress = (value: string) => {
    updateFormField('dropoffAddress', value)
    setDropoffCoordinates(null)
  }

  const updatePassengerCount = (nextCount: number) => {
    const clamped = Math.max(1, Math.min(vehicleCapacity, nextCount || 1))
    setPassengerCount(clamped)
    setTravelers((prev) => {
      const nextExtraCount = Math.max(0, clamped - 1)
      if (prev.length === nextExtraCount) return prev
      if (prev.length > nextExtraCount) return prev.slice(0, nextExtraCount)
      return [...prev, ...Array.from({ length: nextExtraCount - prev.length }, emptyTraveler)]
    })
    setTravelerErrors([])
  }

  const updateTraveler = (index: number, field: keyof TravelerDetails, value: string) => {
    setTravelers((prev) =>
      prev.map((traveler, travelerIndex) =>
        travelerIndex === index ? { ...traveler, [field]: value } : traveler
      )
    )
  }

  const handlePickupPlaceSelected = (address: string, place: GooglePlaceResult) => {
    setPickupCoordinates(getPlaceCoordinates(place))
    if (needsPickupArea) {
      const inferred = inferLagosPickupArea(address)
      if (inferred) {
        setPickupArea(inferred)
        setPickupAreaError(false)
      }
    }
  }

  const handleDropoffPlaceSelected = (_address: string, place: GooglePlaceResult) => {
    setDropoffCoordinates(getPlaceCoordinates(place))
  }

  const validate = () => {
    const e: Partial<typeof form> = {}
    if (!form.fullName.trim()) e.fullName = 'Full name is required'
    if (!form.email.includes('@')) e.email = 'Valid email required'
    if (!form.phone.trim()) e.phone = 'Phone number is required'
    if (!form.passportId.trim()) e.passportId = 'Required for border crossing'
    if (!form.nationality.trim()) e.nationality = 'Nationality is required'
    if (!form.pickupAddress.trim()) e.pickupAddress = 'Pickup address is required'
    if (!form.dropoffAddress.trim()) e.dropoffAddress = 'Drop-off address is required'
    const extraErrors = travelers.map((traveler) => {
      const travelerError: Partial<TravelerDetails> = {}
      if (!traveler.fullName.trim()) travelerError.fullName = 'Full name is required'
      if (!traveler.passportId.trim()) travelerError.passportId = 'Required for border crossing'
      if (!traveler.nationality.trim()) travelerError.nationality = 'Nationality is required'
      return travelerError
    })
    const hasTravelerErrors = extraErrors.some((travelerError) => Object.keys(travelerError).length > 0)
    setPickupAreaError(needsPickupArea && !pickupArea)
    setErrors(e)
    setTravelerErrors(extraErrors)
    return (
      passengerCount <= vehicleCapacity &&
      Object.keys(e).length === 0 &&
      !hasTravelerErrors &&
      (!needsPickupArea || !!pickupArea)
    )
  }

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (tripType === 'round-trip' && !returnDate) return
    const travelerManifest = [
      {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        passportId: form.passportId,
        nationality: form.nationality,
        lead: true,
      },
      ...travelers.map((traveler, index) => ({
        ...traveler,
        lead: false,
        sequence: index + 2,
      })),
    ]
    const search = new URLSearchParams({
      vehicle: vehicleId, from, to, date, returnDate, tripType, passengers: String(passengerCount),
      price: String(total),
      name: form.fullName, email: form.email, phone: form.phone,
      passportId: form.passportId,
      nationality: form.nationality,
      travelers: JSON.stringify(travelerManifest),
      pickupAddress: form.pickupAddress,
      dropoffAddress: form.dropoffAddress,
      specialRequirements: form.specialRequirements,
    })
    if (fleetVehicle?.id) search.set('fleetVehicle', fleetVehicle.id)
    if (pickupArea) search.set('pickupArea', pickupArea)
    router.push(`/${locale}/rides/pay?${search.toString()}`)
  }

  const legCount = tripType === 'round-trip' ? 2 : 1
  const rideFare = (dropoffFare ?? 0) * legCount
  const borderFee = matchedRoute ? getRouteBorderFee(matchedRoute.id as RouteId, tripType) : 0
  const total = rideFare + borderFee
  const nationalityOptions = [
    t('nationalityNigerian'),
    t('nationalityBeninese'),
    t('nationalityTogolese'),
    t('nationalityGhanaian'),
    t('nationalityOther'),
  ]

  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const formattedReturnDate = returnDate
    ? new Date(returnDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen" style={{ background: '#f4f2f8' }}>
      <div className="pt-20 pb-12 md:pt-24 md:pb-20 max-w-[1280px] mx-auto px-4 md:px-10">

        {/* Back */}
        <Link
          href={`/${locale}/rides`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4 md:mb-6 group transition-colors"
        >
          <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          Back to Rides
        </Link>

        {/* Road journey tracker */}
        <JourneyTracker steps={[
          { n: 1, label: t('stepSearch'), done: true },
          { n: 2, label: t('stepDetails'), active: true },
          { n: 3, label: t('stepPayment') },
          { n: 4, label: t('stepConfirmed') },
        ]} />

        {/* Title */}
        <motion.div
          className="mb-6 md:mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: '#3e004c' }}>{t('pageTitle')}</h1>
          <p className="text-gray-500 mt-1 text-sm">{t('pageSubtitle')}</p>
        </motion.div>

        <form onSubmit={handleContinue}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* LEFT */}
            <motion.div
              className="lg:col-span-8 space-y-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            >
              {/* Passenger info card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-6">
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-100">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#f3e8f8' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#3e004c' }}>person</span>
                  </div>
                  <h2 className="font-semibold text-gray-900">{t('passengerInfo')}</h2>
                </div>

                <div className="mb-5 rounded-2xl border border-[#ead5f5] bg-[#fdf5ff] p-3.5 md:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Passenger manifest</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {vehicleDisplayName ?? 'Selected vehicle'} can carry up to {vehicleCapacity} passengers.
                      </p>
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => updatePassengerCount(passengerCount - 1)}
                        disabled={passengerCount <= 1}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Reduce passenger count"
                      >
                        <span className="material-symbols-outlined text-[18px]">remove</span>
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={vehicleCapacity}
                        value={passengerCount}
                        onChange={(event) => updatePassengerCount(parseInt(event.target.value, 10))}
                        className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-center text-sm font-semibold text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-24"
                      />
                      <button
                        type="button"
                        onClick={() => updatePassengerCount(passengerCount + 1)}
                        disabled={passengerCount >= vehicleCapacity}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Increase passenger count"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                      </button>
                    </div>
                  </div>
                  {passengerCount > vehicleCapacity && (
                    <p className="mt-2 text-xs text-red-500">
                      This vehicle can only carry {vehicleCapacity} passengers. Choose a larger vehicle or reduce the group size.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { id: 'fullName', label: t('fieldName'), placeholder: t('fieldNamePlaceholder'), type: 'text' },
                    { id: 'email', label: t('fieldEmail'), placeholder: t('fieldEmailPlaceholder'), type: 'email' },
                    { id: 'phone', label: t('fieldPhone'), placeholder: t('fieldPhonePlaceholder'), type: 'tel' },
                    { id: 'passportId', label: t('fieldPassport'), placeholder: t('fieldPassportPlaceholder'), type: 'text' },
                  ].map(({ id, label, placeholder, type }) => (
                    <div key={id}>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
                      <input
                        type={type}
                        value={form[id as keyof typeof form]}
                        onChange={set(id as keyof typeof form)}
                        placeholder={placeholder}
                        className={errors[id as keyof typeof form] ? INPUT_ERR : INPUT_OK}
                      />
                      {errors[id as keyof typeof form] && (
                        <p className="text-xs text-red-500 mt-1">{errors[id as keyof typeof form]}</p>
                      )}
                    </div>
                  ))}

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('fieldNationality')}</label>
                    <select value={form.nationality} onChange={set('nationality')} className={errors.nationality ? INPUT_ERR : INPUT_OK}>
                      <option value="">{t('fieldNationalityPlaceholder')}</option>
                      {nationalityOptions.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    {errors.nationality && (
                      <p className="text-xs text-red-500 mt-1">{errors.nationality}</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Special Requirements <span className="text-gray-400 font-normal">{t('fieldSpecialOptional')}</span>
                    </label>
                    <textarea
                      value={form.specialRequirements}
                      onChange={set('specialRequirements')}
                      placeholder={t('fieldSpecialPlaceholder')}
                      rows={3}
                      className={INPUT_OK + ' resize-none'}
                    />
                  </div>
                </div>

                {travelers.length > 0 && (
                  <div className="mt-5 space-y-3 border-t border-gray-100 pt-5">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Additional travellers</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Add each traveller&apos;s border details so operations can prepare the trip manifest.
                      </p>
                    </div>
                    {travelers.map((traveler, index) => {
                      const travelerError = travelerErrors[index] ?? {}
                      return (
                        <div key={index} className="rounded-2xl border border-gray-100 bg-gray-50 p-3.5 md:p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                              {index + 2}
                            </span>
                            <p className="text-sm font-semibold text-gray-900">Traveller {index + 2}</p>
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Full name *</label>
                              <input
                                value={traveler.fullName}
                                onChange={(event) => updateTraveler(index, 'fullName', event.target.value)}
                                placeholder="Name as shown on passport or ID"
                                className={travelerError.fullName ? INPUT_ERR : INPUT_OK}
                              />
                              {travelerError.fullName && (
                                <p className="text-xs text-red-500 mt-1">{travelerError.fullName}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                              <input
                                value={traveler.phone}
                                onChange={(event) => updateTraveler(index, 'phone', event.target.value)}
                                placeholder="Traveller phone number"
                                className={INPUT_OK}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Passport / ID *</label>
                              <input
                                value={traveler.passportId}
                                onChange={(event) => updateTraveler(index, 'passportId', event.target.value)}
                                placeholder="Passport or ID reference"
                                className={travelerError.passportId ? INPUT_ERR : INPUT_OK}
                              />
                              {travelerError.passportId && (
                                <p className="text-xs text-red-500 mt-1">{travelerError.passportId}</p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nationality *</label>
                              <select
                                value={traveler.nationality}
                                onChange={(event) => updateTraveler(index, 'nationality', event.target.value)}
                                className={travelerError.nationality ? INPUT_ERR : INPUT_OK}
                              >
                                <option value="">{t('fieldNationalityPlaceholder')}</option>
                                {nationalityOptions.map((n) => (
                                  <option key={n} value={n}>{n}</option>
                                ))}
                              </select>
                              {travelerError.nationality && (
                                <p className="text-xs text-red-500 mt-1">{travelerError.nationality}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Pickup & drop-off card */}
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-[#fbf8fc] p-4 md:p-6">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#f3e8f8' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#3e004c' }}>location_on</span>
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">{t('pickupDropoff')}</h2>
                      <p className="mt-1 text-xs leading-relaxed text-gray-500">
                        Add exact pickup and drop-off points so dispatch can assign the right driver, route, and border timing.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 md:p-6">
                  <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
                    <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-[0_12px_35px_rgba(62,0,76,0.06)]">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                          {t('pickupLabel')} <span className="text-primary">{from}</span>
                        </label>
                        <span className="material-symbols-outlined text-[18px] text-primary">my_location</span>
                      </div>
                      <AddressAutocomplete
                        value={form.pickupAddress}
                        onChange={updatePickupAddress}
                        onPlaceSelected={handlePickupPlaceSelected}
                        placeholder={`${t('addressPlaceholder')} in ${from}`}
                        inputClassName={errors.pickupAddress ? INPUT_ERR : INPUT_OK}
                        icon="radio_button_checked"
                        iconColor="#3e004c"
                        helperText={
                          needsPickupArea
                            ? 'Google suggestions can help identify Mainland or Island pickup, but you can still choose the fare zone below.'
                            : 'Search a hotel, landmark, terminal, office, or full street address.'
                        }
                      />
                      {errors.pickupAddress && (
                        <p className="mt-2 text-xs text-red-500">{errors.pickupAddress}</p>
                      )}
                    </div>

                    <div className="hidden h-full min-h-[104px] flex-col items-center justify-center md:flex" aria-hidden="true">
                      <div className="h-2 w-2 rounded-full bg-[#3e004c]" />
                      <div className="h-full w-px bg-gradient-to-b from-[#3e004c] via-gray-200 to-[#735c00]" />
                      <div className="h-2 w-2 rounded-full bg-[#735c00]" />
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-[0_12px_35px_rgba(115,92,0,0.06)]">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                          {t('dropoffLabel')} <span style={{ color: '#735c00' }}>{to}</span>
                        </label>
                        <span className="material-symbols-outlined text-[18px]" style={{ color: '#735c00' }}>flag</span>
                      </div>
                      <AddressAutocomplete
                        value={form.dropoffAddress}
                        onChange={updateDropoffAddress}
                        onPlaceSelected={handleDropoffPlaceSelected}
                        placeholder={`${t('dropoffPlaceholder')} in ${to}`}
                        inputClassName={errors.dropoffAddress ? INPUT_ERR : INPUT_OK}
                        icon="location_on"
                        iconColor="#735c00"
                        helperText="Use the final address if known, or the closest hotel, landmark, airport, or meeting point."
                      />
                      {errors.dropoffAddress && (
                        <p className="mt-2 text-xs text-red-500">{errors.dropoffAddress}</p>
                      )}
                    </div>
                  </div>

                  <AddressMapPreview
                    pickup={pickupCoordinates}
                    dropoff={dropoffCoordinates}
                    from={from}
                    to={to}
                  />

                  {needsPickupArea && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 md:p-4">
                      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-900">Lagos pickup fare zone</p>
                        {pickupArea && (
                          <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-900">
                            {pickupArea === 'mainland' ? 'Mainland selected' : 'Island selected'}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {([
                          { id: 'mainland', label: 'Lagos Mainland', price: '₦160,000', hint: 'Ikeja, Yaba, Surulere, Gbagada, Maryland and nearby areas' },
                          { id: 'island', label: 'Lagos Island', price: '₦180,000', hint: 'VI, Ikoyi, Lekki, Ajah, Oniru, Marina and nearby areas' },
                        ] as const).map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setPickupArea(option.id)
                              setPickupAreaError(false)
                            }}
                            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                              pickupArea === option.id
                                ? 'border-primary bg-white text-primary shadow-sm'
                                : 'border-amber-200 bg-white/70 text-gray-700 hover:border-primary/40'
                            }`}
                          >
                            <span className="block text-sm font-semibold">{option.label}</span>
                            <span className="mt-0.5 block text-xs font-medium text-gray-500">{option.price} one-way drop-off fare</span>
                            <span className="mt-2 block text-xs leading-relaxed text-gray-500">{option.hint}</span>
                          </button>
                        ))}
                      </div>
                      {pickupAreaError && (
                        <p className="mt-2 text-xs text-red-500">Choose Mainland or Island pickup to calculate the correct saloon fare.</p>
                      )}
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 rounded-2xl border border-[#ead5f5] bg-[#fdf5ff] p-3.5 text-xs text-gray-600 md:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[17px] text-primary">route</span>
                      Route-aware fare
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[17px] text-primary">schedule</span>
                      Dispatch timing
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[17px] text-primary">verified</span>
                      Border assistance
                    </div>
                  </div>
                </div>
              </div>

              {/* Border protocol notice */}
              <div className="rounded-2xl p-4 md:p-5 border flex gap-3 md:gap-4 items-start" style={{ background: '#fdf5ff', borderColor: '#e4c8f0' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#ead5f5' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#3e004c' }}>verified_user</span>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: '#3e004c' }}>{t('borderNoticeTitle')}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {t('borderNoticeDesc')}
                  </p>
                </div>
              </div>

              {/* Cancellation and refund notice */}
              <div className="rounded-2xl p-4 md:p-5 border flex gap-3 md:gap-4 items-start" style={{ background: '#fffdf0', borderColor: '#f0e6b0' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fff4bf' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#735c00' }}>policy</span>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: '#735c00' }}>Cancellation and refund policy</p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Cancellations made less than 24 hours before departure attract a fee equal to the full one-way trip cost. Refund requests are reviewed against the cancellation time, payment status, and operational commitments already made.
                  </p>
                  <Link href={`/${locale}/terms`} className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline">
                    Read full terms
                  </Link>
                </div>
              </div>

              {/* Mobile submit */}
              <button
                type="submit"
                className="lg:hidden w-full py-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-lg"
                style={{ background: '#3e004c' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
                {t('continuePayment')}
              </button>
            </motion.div>

            {/* RIGHT — Summary */}
            <motion.div
              className="lg:col-span-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
            >
              <div className="space-y-4 lg:sticky lg:top-24">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Header strip */}
                  <div className="px-4 py-4 md:px-6" style={{ background: '#3e004c' }}>
                    <p className="text-xs font-bold uppercase tracking-widest text-white/70">{t('summaryTitle')}</p>
                  </div>

                  <div className="p-4 md:p-6 space-y-5">
                    {/* Animated route map */}
                    <RouteMapSVG from={from} to={to} duration="~6 hrs" distance="~140 km" />

                    <div className="border-t border-gray-100" />

                    {/* Vehicle */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#f3e8f8' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#3e004c' }}>airport_shuttle</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{vehicleDisplayName ?? vehicleId}</p>
                        <p className="text-xs text-gray-500">
                          {passengerCount} of {vehicleCapacity} passengers • {tripType}
                        </p>
                      </div>
                    </div>

                    {/* Date */}
                    {formattedDate && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#f3e8f8' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#3e004c' }}>calendar_month</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900">{formattedDate}</p>
                      </div>
                    )}

                    {tripType === 'round-trip' && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#f3e8f8' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#3e004c' }}>event_repeat</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900">{formattedReturnDate ?? 'Return date required'}</p>
                      </div>
                    )}

                    {/* Price breakdown */}
                    {dropoffFare && (
                      <>
                        <div className="border-t border-gray-100" />
                        <p className="text-xs text-gray-500">
                          {tripType === 'round-trip'
                            ? 'Ride fare is calculated as drop-off fare x 2.'
                            : 'Ride fare is the selected one-way drop-off fare.'}
                        </p>
                        <div className="space-y-2.5">
                          {[
                            { label: tripType === 'round-trip' ? `${t('rideFare')} (drop-off x 2)` : `${t('rideFare')} (drop-off)`, value: rideFare },
                            { label: t('borderFee'), value: borderFee },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between text-sm">
                              <span className="text-gray-500">{label}</span>
                              <span className="text-gray-900 font-medium">
                                ₦<CountUp end={value} separator="," duration={1.2} />
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-between pt-3 border-t border-gray-200">
                            <span className="font-bold text-gray-900">{t('total')}</span>
                            <span className="font-bold text-base" style={{ color: '#735c00' }}>
                              ₦<CountUp end={total} separator="," duration={1.5} />
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Desktop CTA */}
                    <button
                      type="submit"
                      className="hidden lg:flex w-full py-4 rounded-xl text-sm font-semibold text-white items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
                      style={{ background: '#3e004c' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
                    {t('continuePayment')}
                    </button>
                  </div>
                </div>

                {/* Guarantee badge */}
                <div className="rounded-xl p-4 border flex items-start gap-3" style={{ background: '#fffdf0', borderColor: '#f0e6b0' }}>
                  <span className="material-symbols-outlined shrink-0 mt-0.5" style={{ fontSize: 18, color: '#735c00' }}>verified</span>
                  <div>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: '#735c00' }}>{t('guarantee')}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{t('guaranteeDesc')}</p>
                  </div>
                </div>
              </div>
            </motion.div>

          </div>
        </form>
      </div>
    </div>
  )
}

export default function PassengerDetailsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f2f8' }}>
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-[40px]" style={{ color: '#3e004c' }}>progress_activity</span>
          <p className="text-sm text-gray-500">Loading your booking...</p>
        </div>
      </div>
    }>
      <PassengerDetailsContent />
    </Suspense>
  )
}
