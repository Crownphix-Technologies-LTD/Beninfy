'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminPageHeader,
  AdminStatCard,
  AdminModal,
  adminInputClass,
  adminLabelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from './AdminUI'
import type {
  AnnouncementContent,
  NotificationAudience,
  NotificationDashboard,
  NotificationPreview,
} from '@/lib/admin/notificationContract'

type Recipient = { id: string; name: string | null; email: string | null }
type Detail = NotificationPreview & {
  deliverySummary: Record<string, number>
  noActiveDevice: number
}
const audiences = {
  customer: 'Individual Customer',
  driver: 'Individual Driver',
  all_customers: 'All Customers',
  all_drivers: 'All Drivers',
}
const emptyContent = (): AnnouncementContent => ({
  en: { title: '', body: '' },
  fr: { title: '', body: '' },
})
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(
    '/api/admin/notifications' + path,
    data === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
  )
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Request failed')
  return result as T
}
function Copy({ content }: { content: AnnouncementContent }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['en', 'fr'] as const).map((language) => (
        <section key={language} className="rounded-xl border border-gray-200 p-4">
          <p className={adminLabelClass}>{language === 'en' ? 'English' : 'French'}</p>
          <h3 className="font-semibold break-words">{content[language].title}</h3>
          <p className="mt-2 text-sm break-words whitespace-pre-wrap text-gray-600">
            {content[language].body}
          </p>
        </section>
      ))}
    </div>
  )
}
function Summary({ summary, noDevice }: { summary: Record<string, number>; noDevice: number }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      {[
        ['Pending deliveries', summary.pending ?? 0],
        ['Sent deliveries', summary.sent ?? 0],
        ['Failed deliveries', summary.failed ?? 0],
        ['Blocked deliveries', summary.blocked ?? 0],
        ['Invalid devices', summary.invalid_token ?? 0],
        ['Skipped deliveries', summary.skipped ?? 0],
        ['Recipients without active devices', noDevice],
      ].map(([label, count]) => (
        <div key={label} className="rounded-xl bg-gray-50 p-3">
          <dt>{label}</dt>
          <dd className="font-bold">{count}</dd>
        </div>
      ))}
    </dl>
  )
}
export default function NotificationConsole() {
  const [dashboard, setDashboard] = useState<NotificationDashboard | null>(null)
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined])
  const cursor = cursorStack.at(-1)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [audience, setAudience] = useState<NotificationAudience>('customer')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Recipient[]>([])
  const [recipient, setRecipient] = useState<Recipient | null>(null)
  const [content, setContent] = useState(emptyContent)
  const [requestId, setRequestId] = useState('')
  const [preview, setPreview] = useState<NotificationPreview | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const load = useCallback(async () => {
    try {
      setDashboard(
        await api<NotificationDashboard>(cursor ? '?cursor=' + encodeURIComponent(cursor) : '')
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }, [cursor])
  useEffect(() => {
    let active = true
    api<NotificationDashboard>(cursor ? '?cursor=' + encodeURIComponent(cursor) : '')
      .then((data) => {
        if (active) setDashboard(data)
      })
      .catch((error) => {
        if (active) setError((error as Error).message)
      })
    return () => {
      active = false
    }
  }, [cursor])
  useEffect(() => {
    if (!open || preview || audience.startsWith('all_') || query.trim().length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          '/api/admin/notifications/recipients?audience=' +
            audience +
            '&q=' +
            encodeURIComponent(query),
          { signal: controller.signal, cache: 'no-store' }
        )
        if (!r.ok) throw new Error('Unable to search recipients')
        const data = await r.json()
        if (!controller.signal.aborted) setResults(data.recipients)
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, audience, query, preview])
  function changed() {
    setRequestId(crypto.randomUUID())
    setError('')
  }
  function start() {
    setAudience('customer')
    setRecipient(null)
    setQuery('')
    setResults([])
    setContent(emptyContent())
    setPreview(null)
    setConfirmation('')
    setError('')
    setNotice('')
    setRequestId(crypto.randomUUID())
    setOpen(true)
  }
  async function review() {
    setBusy(true)
    setError('')
    try {
      setPreview(
        await api<NotificationPreview>('/preview', {
          requestId,
          audience,
          ...(recipient && !audience.startsWith('all_') ? { recipientId: recipient.id } : {}),
          content,
        })
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function send() {
    if (!preview) return
    setBusy(true)
    setError('')
    try {
      await api('', {
        campaignId: preview.id,
        confirmation: audience.startsWith('all_') ? confirmation : preview.confirmation,
      })
      setOpen(false)
      setNotice('Notification queued. Delivery status will update when the delivery worker runs.')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function showDetail(id: string) {
    setError('')
    try {
      setDetail(await api<Detail>('/' + encodeURIComponent(id)))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <>
      <AdminPageHeader
        title="Notifications"
        icon="notifications"
        description="Create localized messages and review notification delivery history."
        actions={
          <>
            <button className={adminSecondaryButtonClass} onClick={() => void load()}>
              Refresh
            </button>
            <button className={adminPrimaryButtonClass} onClick={start}>
              Send notification
            </button>
          </>
        }
      />
      {error && !open && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {!dashboard ? (
        <p role="status">Loading notifications…</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ['Notifications created', dashboard.metrics.notifications],
              ['Pending device deliveries', dashboard.metrics.pending],
              ['Sent device deliveries', dashboard.metrics.sent],
              ['Failed / blocked deliveries', dashboard.metrics.failed],
              ['Active Customer devices', dashboard.metrics.customerDevices],
              ['Active Driver devices', dashboard.metrics.driverDevices],
            ].map(([label, value]) => (
              <AdminStatCard
                key={label}
                label={String(label)}
                value={Number(value).toLocaleString()}
                icon="notifications"
              />
            ))}
          </div>
          <section className="rounded-2xl border border-gray-100 bg-white p-5">
            <h2 className="mb-4 font-semibold text-[#3e004c]">Admin notification history</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      'Created',
                      'Audience',
                      'Title / type',
                      'Recipients',
                      'Delivery status',
                      'Details',
                    ].map((h) => (
                      <th key={h} className="border-b p-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.history.map((row) => (
                    <tr key={row.id}>
                      <td className="border-b p-3">
                        {new Date(row.queuedAt ?? row.createdAt).toLocaleString()}
                      </td>
                      <td className="border-b p-3">
                        {audiences[row.audience as NotificationAudience]}
                      </td>
                      <td className="max-w-xs border-b p-3 break-words">
                        {row.title}
                        <span className="block text-xs text-gray-500">{row.type}</span>
                      </td>
                      <td className="border-b p-3">{row.recipientCount.toLocaleString()}</td>
                      <td className="border-b p-3">
                        {row.deliverySummary.sent ?? 0} sent · {row.deliverySummary.pending ?? 0}{' '}
                        pending ·{' '}
                        {(row.deliverySummary.failed ?? 0) + (row.deliverySummary.blocked ?? 0)}{' '}
                        failed/blocked
                      </td>
                      <td className="border-b p-3">
                        <button
                          className={adminSecondaryButtonClass}
                          onClick={() => void showDetail(row.id)}
                          aria-label={'View ' + row.title}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!dashboard.history.length && (
              <p className="py-6 text-sm text-gray-500">No Admin notifications have been queued.</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                className={adminSecondaryButtonClass}
                disabled={cursorStack.length === 1}
                onClick={() => setCursorStack((s) => s.slice(0, -1))}
              >
                Previous
              </button>
              <button
                className={adminSecondaryButtonClass}
                disabled={!dashboard.nextCursor}
                onClick={() => setCursorStack((s) => [...s, dashboard.nextCursor!])}
              >
                Next
              </button>
            </div>
          </section>
        </>
      )}
      <AdminModal
        open={open}
        title={preview ? 'Confirm notification' : 'Send notification'}
        icon="notifications"
        onClose={() => {
          if (!busy) setOpen(false)
        }}
        maxWidth="xl"
        footer={
          <div className="flex justify-end gap-3">
            {preview && (
              <button
                disabled={busy}
                className={adminSecondaryButtonClass}
                onClick={() => {
                  setPreview(null)
                  setConfirmation('')
                  changed()
                }}
              >
                Edit / refresh preview
              </button>
            )}
            <button
              disabled={
                busy ||
                (!preview && !audience.startsWith('all_') && !recipient) ||
                (!!preview && audience.startsWith('all_') && confirmation !== preview.confirmation)
              }
              className={adminPrimaryButtonClass}
              onClick={() => void (preview ? send() : review())}
            >
              {busy
                ? 'Working…'
                : preview
                  ? 'Confirm and queue notification'
                  : 'Review notification'}
            </button>
          </div>
        }
      >
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {preview ? (
          <div className="space-y-5">
            <p className="font-semibold">{audiences[preview.audience as NotificationAudience]}</p>
            {preview.recipient && (
              <p>
                {preview.recipient.name}{' '}
                <span className="text-gray-500">{preview.recipient.email}</span>
              </p>
            )}
            <p>
              {preview.recipientCount.toLocaleString()} recipients ·{' '}
              {preview.deviceCount.toLocaleString()} active push-capable devices
            </p>
            <Copy content={preview.content} />
            <p className="text-sm text-gray-600">
              Messages are saved to each recipient’s inbox. Push delivery depends on an active
              registered device. Review expires in 10 minutes.
            </p>
            {audience.startsWith('all_') && (
              <label className={adminLabelClass}>
                Type “{preview.confirmation}” to confirm this broadcast
                <input
                  className={'mt-2 ' + adminInputClass}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </label>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <label className={adminLabelClass}>
              Audience
              <select
                className={'mt-2 ' + adminInputClass}
                value={audience}
                disabled={busy}
                onChange={(e) => {
                  setAudience(e.target.value as NotificationAudience)
                  setRecipient(null)
                  setQuery('')
                  setResults([])
                  changed()
                }}
              >
                {Object.entries(audiences).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {!audience.startsWith('all_') && (
              <div>
                <label className={adminLabelClass}>
                  Find {audience === 'customer' ? 'Customer' : 'Driver'} by name or email
                  <input
                    className={'mt-2 ' + adminInputClass}
                    value={query}
                    disabled={busy}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setRecipient(null)
                      setResults([])
                      changed()
                    }}
                    placeholder="Enter at least 2 characters"
                  />
                </label>
                {recipient ? (
                  <p className="rounded-xl bg-purple-50 p-3 text-sm">
                    Selected: {recipient.name} · {recipient.email}
                  </p>
                ) : (
                  <ul className="max-h-48 overflow-y-auto">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button
                          className="w-full rounded-lg p-3 text-left text-sm hover:bg-purple-50"
                          disabled={busy}
                          onClick={() => {
                            setRecipient(r)
                            setResults([])
                            changed()
                          }}
                        >
                          {r.name ?? 'Unnamed account'} · {r.email}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {audience.startsWith('all_') && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                This sends to every eligible {audience === 'all_customers' ? 'Customer' : 'Driver'}{' '}
                account, including inbox-only recipients. A separate confirmation is required.
                Maximum 5,000 recipients.
              </p>
            )}
            <div className="grid gap-5 sm:grid-cols-2">
              {(['en', 'fr'] as const).map((language) => (
                <section key={language} className="space-y-3">
                  <h3 className="font-semibold">{language === 'en' ? 'English' : 'French'}</h3>
                  <label className={adminLabelClass}>
                    Title (100 characters maximum)
                    <input
                      className={'mt-2 ' + adminInputClass}
                      value={content[language].title}
                      maxLength={100}
                      disabled={busy}
                      onChange={(e) => {
                        setContent((c) => ({
                          ...c,
                          [language]: { ...c[language], title: e.target.value },
                        }))
                        changed()
                      }}
                    />
                  </label>
                  <label className={adminLabelClass}>
                    Message (1,000 characters maximum)
                    <textarea
                      className={'mt-2 min-h-32 ' + adminInputClass}
                      value={content[language].body}
                      maxLength={1000}
                      disabled={busy}
                      onChange={(e) => {
                        setContent((c) => ({
                          ...c,
                          [language]: { ...c[language], body: e.target.value },
                        }))
                        changed()
                      }}
                    />
                  </label>
                </section>
              ))}
            </div>
          </div>
        )}
      </AdminModal>
      <AdminModal
        open={!!detail}
        title="Notification details"
        icon="notifications"
        onClose={() => setDetail(null)}
        maxWidth="xl"
        footer={
          detail && (
            <button
              className={adminSecondaryButtonClass}
              onClick={() => void showDetail(detail.id)}
            >
              Refresh delivery status
            </button>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <p>
              {audiences[detail.audience as NotificationAudience]} ·{' '}
              {detail.recipientCount.toLocaleString()} recipients
            </p>
            {detail.recipient && (
              <p>
                {detail.recipient.name} · {detail.recipient.email}
              </p>
            )}
            <Copy content={detail.content} />
            <Summary summary={detail.deliverySummary} noDevice={detail.noActiveDevice} />
          </div>
        )}
      </AdminModal>
    </>
  )
}
