'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useVehicles } from '@/hooks/useVehicles'
import { useRoutesCatalogue } from '@/hooks/useRoutesCatalogue'
import {
  routeDestinations,
  routeForCityPair,
  routeForOriginChange,
  routeOrigins,
} from '@/lib/webRouteSelection'

export default function BookingWidget() {
  const locale = useLocale()
  const t = useTranslations('booking')
  const router = useRouter()
  const { vehicles } = useVehicles()
  const { routes, loading: routesLoading } = useRoutesCatalogue()

  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [date, setDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [vehicle, setVehicle] = useState('saloon')
  const [tripType, setTripType] = useState<'one-way' | 'round-trip'>('one-way')

  const today = new Date().toISOString().split('T')[0]
  const selectedRoute =
    routes.find((route) => route.available && route.id === selectedRouteId) ??
    routes.find((route) => route.available && route.id === 'lagos-cotonou') ??
    routes.find((route) => route.available)
  const from = selectedRoute?.origin.city ?? ''
  const to = selectedRoute?.destination.city ?? ''
  const origins = routeOrigins(routes)
  const destinations = routeDestinations(routes, from)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRoute) return
    const params = new URLSearchParams({
      routeId: selectedRoute.id,
      from: selectedRoute.origin.city,
      to: selectedRoute.destination.city,
      date,
      vehicle,
      tripType,
    })
    if (tripType === 'round-trip') params.set('returnDate', returnDate)
    router.push(`/${locale}/rides?${params.toString()}`)
  }

  return (
    <section className="relative z-20 mx-auto max-w-[1280px] px-4 md:px-10 -mt-10 md:-mt-16">
      <div className="bg-surface-container-lowest rounded-2xl shadow-xl p-4 md:p-8">
        {/* Trip type toggle */}
        <div className="grid grid-cols-2 gap-2 mb-5 md:flex md:gap-2 md:mb-6">
          {(['one-way', 'round-trip'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTripType(type)}
              className={`rounded-full px-4 py-2.5 text-label-md transition-all ${
                tripType === type
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {type === 'one-way' ? t('types.oneWay') : t('types.roundTrip')}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-4">
            {/* From */}
            <div className="flex flex-col gap-2">
              <label className="text-label-sm text-on-surface-variant">{t('from')}</label>
              <div className="flex items-center gap-2 border border-outline-variant rounded-lg p-3 focus-within:border-primary transition-colors">
                <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
                <select
                  value={from}
                  onChange={(e) => {
                    const nextRoute = routeForOriginChange(routes, selectedRoute, e.target.value)
                    if (nextRoute) setSelectedRouteId(nextRoute.id)
                  }}
                  className="bg-transparent border-none p-0 focus:ring-0 w-full text-body-md outline-none"
                  required
                >
                  <option value="">{t('selectCity')}</option>
                  {origins.map((city) => {
                    const endpoint = routes.find((route) => route.origin.city === city)?.origin
                    return (
                      <option key={city} value={city}>
                        {city}{endpoint?.country ? `, ${endpoint.country}` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            {/* To */}
            <div className="flex flex-col gap-2">
              <label className="text-label-sm text-on-surface-variant">{t('to')}</label>
              <div className="flex items-center gap-2 border border-outline-variant rounded-lg p-3 focus-within:border-primary transition-colors">
                <span className="material-symbols-outlined text-primary text-[20px]">near_me</span>
                <select
                  value={to}
                  onChange={(e) => {
                    const nextRoute = routeForCityPair(routes, from, e.target.value)
                    if (nextRoute) setSelectedRouteId(nextRoute.id)
                  }}
                  className="bg-transparent border-none p-0 focus:ring-0 w-full text-body-md outline-none"
                  required
                >
                  <option value="">{t('selectCity')}</option>
                  {destinations.map((city) => {
                    const endpoint = routeForCityPair(routes, from, city)?.destination
                    return (
                      <option key={city} value={city}>
                        {city}{endpoint?.country ? `, ${endpoint.country}` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-2">
              <label className="text-label-sm text-on-surface-variant">{t('date')}</label>
              <div className="flex items-center gap-2 border border-outline-variant rounded-lg p-3 focus-within:border-primary transition-colors">
                <span className="material-symbols-outlined text-primary text-[20px]">calendar_month</span>
                <input
                  type="date"
                  value={date}
                  min={today}
                  onChange={(e) => {
                    setDate(e.target.value)
                    if (returnDate && returnDate < e.target.value) setReturnDate('')
                  }}
                  className="bg-transparent border-none p-0 focus:ring-0 w-full text-body-md outline-none"
                  required
                />
              </div>
            </div>

            {tripType === 'round-trip' && (
              <div className="flex flex-col gap-2">
                <label className="text-label-sm text-on-surface-variant">Return date</label>
                <div className="flex items-center gap-2 border border-outline-variant rounded-lg p-3 focus-within:border-primary transition-colors">
                  <span className="material-symbols-outlined text-primary text-[20px]">event_repeat</span>
                  <input
                    type="date"
                    value={returnDate}
                    min={date || today}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="bg-transparent border-none p-0 focus:ring-0 w-full text-body-md outline-none"
                    required
                  />
                </div>
              </div>
            )}

            {/* Vehicle */}
            <div className="flex flex-col gap-2">
              <label className="text-label-sm text-on-surface-variant">{t('vehicle')}</label>
              <div className="flex items-center gap-2 border border-outline-variant rounded-lg p-3 focus-within:border-primary transition-colors">
                <span className="material-symbols-outlined text-primary text-[20px]">directions_car</span>
                <select
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  className="bg-transparent border-none p-0 focus:ring-0 w-full text-body-md outline-none appearance-none"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Footer row */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center mt-5 md:mt-6 gap-4">
            <div className="grid grid-cols-1 gap-2 text-sm md:flex md:flex-wrap md:gap-4">
              <div className="flex items-center gap-2 text-primary text-label-md">
                <span className="material-symbols-outlined icon-fill text-[18px]">verified</span>
                <span>{t('trustSecure')}</span>
              </div>
              <div className="flex items-center gap-2 text-secondary text-label-md">
                <span className="material-symbols-outlined icon-fill text-[18px]">language</span>
                <span>{t('trustDrivers')}</span>
              </div>
              <div className="flex items-center gap-2 text-primary text-label-md">
                <span className="material-symbols-outlined icon-fill text-[18px]">shield</span>
                <span>{t('trustBorder')}</span>
              </div>
            </div>
            <button
              type="submit"
              disabled={routesLoading || !selectedRoute}
              className="w-full md:w-auto bg-primary text-on-primary px-12 py-4 rounded-xl text-headline-sm shadow-lg hover:shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            >
              {t('search')}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
