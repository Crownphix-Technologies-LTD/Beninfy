'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, RefreshCw } from 'lucide-react'
import { AdminModal, AdminPageHeader, adminSecondaryButtonClass } from '@/components/admin/AdminUI'

type Report = {
  id: string
  overallRating: number
  comment: string | null
  riskFlags: string[]
  submittedAt: string
  reviewRequired: boolean
  customer: { name: string | null; email: string | null; anonymizedAt: string | null }
  tourBooking: {
    reference: string
    tourTitle: string
    selectedTourIds: string[]
    startDate: string
    endDate: string
  }
  drivers: Array<{
    id: string
    driverName: string
    professionalRespectful: boolean
    feltSafe: boolean
    followedAgreedService: string
    uncomfortablePersonalQuestions: boolean
    offPlatformSolicitation: boolean
    unauthorizedPaymentRequest: boolean
    comment: string | null
    riskFlags: string[]
    days: Array<{ id: string; dayNumber: number; tourTitle: string; scheduledDate: string }>
  }>
}

const riskLabels: Record<string, string> = {
  safety_concern: 'Safety concern reported',
  off_platform_solicitation: 'Off-platform solicitation reported',
  unauthorized_payment_request: 'Unauthorized payment request reported',
  professionalism_concern: 'Professionalism concern reported',
  service_itinerary_concern: 'Service / itinerary concern reported',
}
const date = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const yesNo = (value: boolean) => (value ? 'Yes' : 'No')

function Flags({ flags }: { flags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
        >
          {riskLabels[flag] ?? 'Customer concern reported'}
        </span>
      ))}
    </div>
  )
}

export default function TourFeedbackConsole() {
  const [rows, setRows] = useState<Report[]>([])
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 })
  const [selected, setSelected] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const query = new URLSearchParams({ page: String(page), pageSize: '20' })
        if (filter !== 'all') query.set('flagged', filter === 'flagged' ? 'true' : 'false')
        const response = await fetch(`/api/admin/tour-feedback?${query}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok)
          throw new Error(
            response.status === 403 ? 'Access denied.' : 'Could not load Tour feedback.'
          )
        const result = await response.json()
        if (!controller.signal.aborted) {
          setRows(result.feedback)
          setPagination(result.pagination)
          setError(null)
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Could not load Tour feedback.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [filter, page, refresh])

  return (
    <>
      <AdminPageHeader title="Tour feedback" eyebrow="Operations" icon="feedback" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs font-semibold text-gray-600">
          Reports
          <select
            value={filter}
            onChange={(event) => {
              setLoading(true)
              setFilter(event.target.value)
              setPage(1)
            }}
            className="ml-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
          >
            <option value="all">All reports</option>
            <option value="flagged">Review required</option>
            <option value="unflagged">No concerns reported</option>
          </select>
        </label>
        <button
          type="button"
          title="Refresh reports"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setRefresh((v) => v + 1)
          }}
          className={adminSecondaryButtonClass}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <div
        aria-busy={loading}
        className="overflow-hidden rounded-lg border border-gray-200 bg-white"
      >
        {loading ? (
          <p role="status" className="p-6 text-sm text-gray-500">
            Loading reports...
          </p>
        ) : !error && rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No reports found.</p>
        ) : (
          !error &&
          rows.map((row) => (
            <article key={row.id} className="border-b border-gray-100 p-4 last:border-b-0">
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_auto]">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{row.tourBooking.reference}</p>
                  <p className="mt-1 text-sm text-gray-600">{row.tourBooking.tourTitle}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {date(row.tourBooking.startDate)} - {date(row.tourBooking.endDate)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{row.customer.name ?? 'Customer'}</p>
                  {!row.customer.anonymizedAt && (
                    <p className="text-xs break-all text-gray-500">{row.customer.email}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{row.overallRating} / 5</p>
                  <p className="mt-1 text-xs text-gray-500">Submitted {date(row.submittedAt)}</p>
                </div>
                <button
                  type="button"
                  title="View report"
                  onClick={() => setSelected(row)}
                  className={adminSecondaryButtonClass}
                >
                  <Eye size={16} />
                  View
                </button>
              </div>
              {row.reviewRequired && (
                <div className="mt-3">
                  <Flags flags={row.riskFlags} />
                </div>
              )}
            </article>
          ))
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>
          {pagination.total} reports - Page {page} of {Math.max(1, pagination.totalPages)}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous page"
            title="Previous page"
            disabled={loading || page <= 1}
            onClick={() => {
              setLoading(true)
              setPage((p) => p - 1)
            }}
            className={adminSecondaryButtonClass}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Next page"
            title="Next page"
            disabled={loading || page >= pagination.totalPages}
            onClick={() => {
              setLoading(true)
              setPage((p) => p + 1)
            }}
            className={adminSecondaryButtonClass}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <AdminModal
        open={Boolean(selected)}
        title={selected?.tourBooking.reference ?? 'Tour feedback'}
        icon="feedback"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="space-y-5 text-sm text-gray-700">
            <div>
              <p className="font-semibold text-gray-900">{selected.tourBooking.tourTitle}</p>
              <p className="mt-1">
                {selected.customer.name ?? 'Customer'} - {selected.overallRating} / 5
              </p>
              <p className="mt-1 text-xs text-gray-500">Submitted {date(selected.submittedAt)}</p>
              {selected.comment && (
                <p className="mt-3 break-words whitespace-pre-wrap">{selected.comment}</p>
              )}
            </div>
            {selected.reviewRequired && (
              <div>
                <p className="mb-2 text-xs font-semibold text-amber-900">
                  Customer reports - Operations review required
                </p>
                <Flags flags={selected.riskFlags} />
              </div>
            )}
            {selected.drivers.map((driver) => (
              <section key={driver.id} className="border-t border-gray-200 pt-4">
                <h3 className="font-semibold text-gray-900">{driver.driverName}</h3>
                <ul className="mt-2 space-y-1 text-xs text-gray-500">
                  {driver.days.map((day) => (
                    <li key={day.id}>
                      Day {day.dayNumber} - {day.tourTitle} - {date(day.scheduledDate)}
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
                  <dt>Professional and respectful</dt>
                  <dd>{yesNo(driver.professionalRespectful)}</dd>
                  <dt>Customer felt safe</dt>
                  <dd>{yesNo(driver.feltSafe)}</dd>
                  <dt>Followed agreed service</dt>
                  <dd>
                    {driver.followedAgreedService === 'not_applicable'
                      ? 'N/A'
                      : driver.followedAgreedService === 'yes'
                        ? 'Yes'
                        : 'No'}
                  </dd>
                  <dt>Uncomfortable personal questioning</dt>
                  <dd>{yesNo(driver.uncomfortablePersonalQuestions)}</dd>
                  <dt>Off-platform booking/payment request</dt>
                  <dd>{yesNo(driver.offPlatformSolicitation)}</dd>
                  <dt>Unauthorized additional payment request</dt>
                  <dd>{yesNo(driver.unauthorizedPaymentRequest)}</dd>
                </dl>
                {driver.comment && (
                  <p className="mt-3 break-words whitespace-pre-wrap">{driver.comment}</p>
                )}
                <div className="mt-3">
                  <Flags flags={driver.riskFlags} />
                </div>
              </section>
            ))}
          </div>
        )}
      </AdminModal>
    </>
  )
}
