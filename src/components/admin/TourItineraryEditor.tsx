'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatNGN } from '@/lib/utils'
import { CANONICAL_TOUR_IDS } from '@/lib/tourCommercial'
import {
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from '@/components/admin/AdminUI'
import TourLocationEditor from '@/components/admin/TourLocationEditor'
import {
  beninThreeDayDraft,
  itineraryDraftErrors,
  itineraryDraftFromDto,
  itineraryDraftPayload,
  locationHasCoordinates,
  moveItem,
  newDay,
  newStop,
  readinessGuidance,
  type DayDraft,
  type StopDraft,
  type ItineraryResponse,
} from '@/lib/admin/tourItineraryForm'

type Props = {
  operationsQuote?: { request: string; pending: boolean }
  tour: { id: string; title: string; durationDays: number; startingFromNGN: number }
  initial: ItineraryResponse
  locale: string
}

function TextField({
  label,
  value,
  onChange,
  long = false,
  maxLength = 160,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  long?: boolean
  maxLength?: number
}) {
  return (
    <label className={adminLabelClass}>
      {label}
      {long ? (
        <textarea
          rows={2}
          className={adminInputClass}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={adminInputClass}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  )
}

function StopCard({
  stop,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  stop: StopDraft
  index: number
  total: number
  onChange: (stop: StopDraft) => void
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <article className="rounded-xl border border-gray-200 bg-[#fbf7fc] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="min-w-0 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="block text-xs font-medium text-gray-500">
            Stop {index + 1} of {total}
          </span>
          <span className="font-semibold text-[#3e004c]">{stop.title || 'Untitled stop'}</span>
          <span className="ml-2 text-xs">{expanded ? 'Close editor' : 'Edit stop'}</span>
        </button>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span
            className={
              locationHasCoordinates(stop.location) ? 'text-emerald-800' : 'text-amber-800'
            }
          >
            {locationHasCoordinates(stop.location) ? 'Location selected' : 'Location needed'}
          </span>
          <button
            type="button"
            disabled={index === 0}
            className="disabled:opacity-30"
            aria-label={'Move stop ' + (index + 1) + ' up'}
            onClick={() => onMove(-1)}
          >
            Move up
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            className="disabled:opacity-30"
            aria-label={'Move stop ' + (index + 1) + ' down'}
            onClick={() => onMove(1)}
          >
            Move down
          </button>
          <button type="button" className="text-red-700" onClick={onRemove}>
            Remove stop
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Stop title (EN)"
              value={stop.title}
              onChange={(title) => onChange({ ...stop, title })}
            />
            <TextField
              label="Stop title (FR)"
              value={stop.titleFr}
              onChange={(titleFr) => onChange({ ...stop, titleFr })}
            />
            <TextField
              label="Description (EN)"
              long
              maxLength={1200}
              value={stop.description}
              onChange={(description) => onChange({ ...stop, description })}
            />
            <TextField
              label="Description (FR)"
              long
              maxLength={1200}
              value={stop.descriptionFr}
              onChange={(descriptionFr) => onChange({ ...stop, descriptionFr })}
            />
          </div>
          <TourLocationEditor
            title="Stop location"
            value={stop.location}
            onChange={(location) => onChange({ ...stop, location })}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className={adminLabelClass}>
              Add-on
              <select className={adminInputClass} value={stop.addonCode ?? ''}
                onChange={(e) => onChange({ ...stop, addonCode: e.target.value || null })}>
                <option value="">Standard itinerary</option>
                <option value="gogotinkpo">Gogotinkpo</option>
              </select>
            </label>
            <label className={adminLabelClass}>
              Estimated duration (minutes, optional)
              <input
                className={adminInputClass}
                type="number"
                min={1}
                max={1440}
                step={1}
                value={stop.estimatedDurationMinutes}
                onChange={(e) => onChange({ ...stop, estimatedDurationMinutes: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stop.required}
                onChange={(e) => onChange({ ...stop, required: e.target.checked })}
              />
              Required stop
            </label>
          </div>
        </div>
      )}
    </article>
  )
}

export default function TourItineraryEditor({ tour, initial, locale, operationsQuote }: Props) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [quotePrice, setQuotePrice] = useState('')
  const [quoteApproved, setQuoteApproved] = useState(operationsQuote ? !operationsQuote.pending : false)
  const endpoint = operationsQuote
    ? '/api/admin/tour-bookings/' + encodeURIComponent(tour.id) + '/quote'
    : '/api/admin/tours/' + encodeURIComponent(tour.id) + '/itinerary'
  const canonicalIndex = CANONICAL_TOUR_IDS.indexOf(tour.id as typeof CANONICAL_TOUR_IDS[number])
  const maximumDays = operationsQuote ? tour.durationDays : canonicalIndex >= 0 ? 1 : 30
  const [days, setDays] = useState(() => itineraryDraftFromDto(initial.itineraryDays))
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(itineraryDraftPayload(itineraryDraftFromDto(initial.itineraryDays)))
  )
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const dirty = JSON.stringify(itineraryDraftPayload(days)) !== baseline

  // Protect document navigation and links in the existing Admin shell.
  useEffect(() => {
    if (!dirty && !busy) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null
      if (
        !link ||
        link.target === '_blank' ||
        link.href === window.location.href ||
        link.getAttribute('href')?.startsWith('#')
      )
        return
      if (!confirm('Discard unsaved itinerary changes and leave?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', click, true)
    }
  }, [dirty, busy])

  function applySaved(response: ItineraryResponse) {
    const next = itineraryDraftFromDto(response.itineraryDays)
    setSaved(response)
    setDays(next)
    setBaseline(JSON.stringify(itineraryDraftPayload(next)))
  }
  function updateDay(index: number, day: DayDraft) {
    setDays((current) => current.map((item, i) => (i === index ? day : item)))
    setNotice('')
  }
  async function reload() {
    if (dirty && !confirm('Discard your unsaved changes and reload the saved itinerary?')) return
    setBusy(true)
    setErrors([])
    setNotice('')
    try {
      const res = await fetch(endpoint, {
        cache: 'no-store',
      })
      const response = await res.json()
      if (!res.ok) throw new Error(response.error || 'Could not reload itinerary')
      applySaved(response)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Reload failed. Your draft is kept.'])
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    const validation = itineraryDraftErrors(days)
    setErrors(validation)
    setNotice('')
    if (validation.length) return
    setBusy(true)
    try {
      if (operationsQuote && (!Number.isInteger(Number(quotePrice)) || Number(quotePrice) <= 0))
        throw new Error('Enter the full booking quote in NGN')
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...itineraryDraftPayload(days),
          expectedUpdatedAt: saved.updatedAt,
          ...(operationsQuote ? { priceNGN: Number(quotePrice) } : {}),
        }),
      })
      const response = await res.json()
      if (!res.ok) throw new Error(response.error || 'Save failed. Your draft is kept.')
      applySaved(response)
      if (operationsQuote) setQuoteApproved(true)
      setNotice('Changes saved. Readiness and ordering below are from the backend.')
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Save failed. Your draft is kept.'])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title={tour.title + ' — Itinerary'}
        description={operationsQuote ? 'Review the requested itinerary and approve the booking quote.' : 'Configure the reusable day-by-day plan. Changes apply to new bookings only; existing booking snapshots stay unchanged.'}
        icon="route"
        actions={
          <button
            type="button"
            className={adminSecondaryButtonClass}
            disabled={busy}
            onClick={() => {
              if (!dirty || confirm('Discard unsaved itinerary changes and return to Tours?'))
                router.push('/' + locale + '/admin/' + (operationsQuote ? 'tour-bookings' : 'tours'))
            }}
          >
            {operationsQuote ? 'Back to bookings' : 'Back to Tours'}
          </button>
        }
      />
      {operationsQuote && (
        <section className="mb-5 border-b border-gray-200 py-5">
          <p className="mb-3 whitespace-pre-wrap text-sm text-gray-700">{operationsQuote.request}</p>
          <label className={adminLabelClass}>
            Full booking quote (NGN)
            <input type="number" min={1} max={20000000} step={1} className={adminInputClass}
              value={quotePrice} disabled={quoteApproved} onChange={(event) => setQuotePrice(event.target.value)} />
          </label>
          {quoteApproved && <p role="status" className="mt-3 text-sm text-emerald-700">Quote approved</p>}
        </section>
      )}
      <section className="mb-5 grid gap-4 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase">{operationsQuote ? 'Booking price' : 'Starting price per Tour'}</p>
          <p className="mt-1 text-2xl font-bold text-[#3e004c]">
            {operationsQuote?.pending ? 'Awaiting quote' : formatNGN(tour.startingFromNGN)}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Not multiplied by traveller count. Catalogue duration: {tour.durationDays} days.
          </p>
        </div>
        <div
          role="status"
          className={
            saved.executionReady
              ? 'rounded-xl bg-emerald-50 p-4 text-emerald-900'
              : 'rounded-xl bg-amber-50 p-4 text-amber-900'
          }
        >
          <p className="font-bold">
            {saved.executionReady ? 'Ready for booking' : 'Not ready for booking'}
          </p>
          <p className="mt-1 text-sm">{readinessGuidance(saved)}</p>
          <p className="mt-2 text-xs">
            Saved configuration{dirty ? ' — unsaved changes are not reflected here.' : '.'}
          </p>
        </div>
      </section>
      <div className="sticky top-0 z-10 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <span className="text-sm font-medium" role="status">
          {busy ? 'Saving or reloading…' : dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className={adminSecondaryButtonClass}
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload saved
          </button>
          <button
            type="button"
            className={adminPrimaryButtonClass}
            disabled={busy || (operationsQuote ? quoteApproved : !dirty)}
            onClick={() => void save()}
          >
            {busy ? 'Please wait…' : operationsQuote ? 'Approve quote and itinerary' : 'Save Changes'}
          </button>
        </div>
      </div>
      {notice && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          {notice}
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Changes have not been saved</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {days.length !== tour.durationDays && (
        <p className="mb-4 text-sm text-amber-900">
          This itinerary contains {days.length} days; the catalogue advertises {tour.durationDays}.
          Review the package duration in Tour details if needed.
        </p>
      )}
      <fieldset disabled={busy || (Boolean(operationsQuote) && quoteApproved)} className="space-y-5 disabled:opacity-70">
        {days.map((day, d) => (
          <section
            key={day.key}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Day {d + 1} of {days.length}
                </p>
                <h2 className="text-xl font-bold text-[#3e004c]">{day.title || 'Untitled day'}</h2>
              </div>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  disabled={Boolean(operationsQuote) || d === 0}
                  className="disabled:opacity-30"
                  onClick={() => setDays(moveItem(days, d, -1))}
                >
                  Move day up
                </button>
                <button
                  type="button"
                  disabled={Boolean(operationsQuote) || d === days.length - 1}
                  className="disabled:opacity-30"
                  onClick={() => setDays(moveItem(days, d, 1))}
                >
                  Move day down
                </button>
                <button
                  type="button"
                  className="text-red-700"
                  disabled={Boolean(operationsQuote)}
                  onClick={() => {
                    if (
                      confirm(
                        'Remove Day ' +
                          (d + 1) +
                          ' and all ' +
                          day.stops.length +
                          ' stops? This takes effect when you save.'
                      )
                    )
                      setDays(days.filter((_, i) => i !== d))
                  }}
                >
                  Remove day
                </button>
              </div>
            </div>
            <details className="mb-4 rounded-xl border border-gray-100 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Edit day details and default pickup / end
              </summary>
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField
                    label="Day title (EN)"
                    value={day.title}
                    onChange={(title) => updateDay(d, { ...day, title })}
                  />
                  <TextField
                    label="Day title (FR)"
                    value={day.titleFr}
                    onChange={(titleFr) => updateDay(d, { ...day, titleFr })}
                  />
                  <TextField
                    label="Description (EN)"
                    long
                    maxLength={1600}
                    value={day.description}
                    onChange={(description) => updateDay(d, { ...day, description })}
                  />
                  <TextField
                    label="Description (FR)"
                    long
                    maxLength={1600}
                    value={day.descriptionFr}
                    onChange={(descriptionFr) => updateDay(d, { ...day, descriptionFr })}
                  />
                </div>
                <p className="text-sm text-gray-600">
                  Default pickup is separate from Stop 1. Keep a package meeting point here when
                  applicable. Customer-selected pickup takes precedence for new private Tour bookings.
                  End location is optional; leave it empty unless the itinerary specifies it.
                </p>
                <div className="grid gap-4 xl:grid-cols-2">
                  <TourLocationEditor
                    title="Default pickup / start"
                    showLabel
                    value={day.start}
                    onChange={(start) => updateDay(d, { ...day, start })}
                  />
                  <TourLocationEditor
                    title="Default end (optional)"
                    showLabel
                    value={day.end}
                    onChange={(end) => updateDay(d, { ...day, end })}
                  />
                </div>
              </div>
            </details>
            {!locationHasCoordinates(day.start) && (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Template default pickup is not configured. Customers select their pickup at booking;
                template readiness depends on itinerary days and stops.
              </p>
            )}
            {day.stops.length === 0 && (
              <p className="mb-4 text-sm text-amber-900">
                This day has no stops. Add at least one stop with a selected location to make it
                bookable.
              </p>
            )}
            <div className="space-y-3">
              {day.stops.map((stop, s) => (
                <StopCard
                  key={stop.key}
                  stop={stop}
                  index={s}
                  total={day.stops.length}
                  onChange={(next) =>
                    updateDay(d, {
                      ...day,
                      stops: day.stops.map((item, i) => (i === s ? next : item)),
                    })
                  }
                  onMove={(offset) =>
                    updateDay(d, { ...day, stops: moveItem(day.stops, s, offset) })
                  }
                  onRemove={() => {
                    if (
                      confirm(
                        'Remove ' +
                          (stop.title || 'this stop') +
                          '? This takes effect when you save.'
                      )
                    )
                      updateDay(d, { ...day, stops: day.stops.filter((_, i) => i !== s) })
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className={adminSecondaryButtonClass + ' mt-4'}
              onClick={() => updateDay(d, { ...day, stops: [...day.stops, newStop()] })}
            >
              Add Stop
            </button>
          </section>
        ))}
        {days.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <h2 className="text-lg font-semibold">Build the itinerary</h2>
            <p className="my-3 text-sm text-gray-600">
              Add days manually or start with the requested Cotonou, Ouidah and Ganvié names. Every
              location must still be selected.
            </p>
            <button
              type="button"
              className={adminSecondaryButtonClass}
              onClick={() => setDays(canonicalIndex >= 0 ? [beninThreeDayDraft()[canonicalIndex]] : beninThreeDayDraft())}
            >
              {canonicalIndex >= 0 ? 'Use Tour outline (names only)' : 'Use 3-day Benin itinerary (names only)'}
            </button>
          </div>
        )}
        <button
          type="button"
          className={adminSecondaryButtonClass}
          disabled={days.length >= maximumDays}
          onClick={() => setDays([...days, newDay()])}
        >
          Add Day
        </button>
      </fieldset>
    </div>
  )
}
