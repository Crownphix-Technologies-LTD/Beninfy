'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminPageHeader, AdminStatusBadge, adminCompactInputClass } from '@/components/admin/AdminUI'

type AuditLogRow = {
  id: string
  actorId: string | null
  actorEmail: string | null
  action: string
  entityType: string
  entityId: string | null
  ipAddress: string | null
  metadata: unknown
  createdAt: string
}

const ACTIONS = ['', 'create', 'update', 'delete', 'status_update', 'password_change', 'password_reset', 'merge_update']
const ENTITY_TYPES = [
  '',
  'booking',
  'border_fee',
  'coupon',
  'driver',
  'fleet_vehicle',
  'route',
  'route_price',
  'tour',
  'user',
  'vehicle',
]

function formatMetadata(metadata: unknown) {
  if (!metadata) return ''
  return JSON.stringify(metadata, null, 2)
}

export default function AdminAuditLogsPage() {
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [actor, setActor] = useState('')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (action) params.set('action', action)
    if (entityType) params.set('entityType', entityType)
    if (actor.trim()) params.set('actor', actor.trim())
    return params.toString()
  }, [action, actor, entityType])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/audit-logs?${query}`)
    const data = await res.json()
    setAuditLogs(data.auditLogs ?? [])
    setLoading(false)
  }, [query])

  useEffect(() => {
    let cancelled = false

    fetch(`/api/admin/audit-logs?${query}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setAuditLogs(data.auditLogs ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setAuditLogs([])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [query])

  return (
    <div>
      <AdminPageHeader
        title="Audit logs"
        description="Review sensitive backoffice activity across bookings, payments, pricing, fleet, coupons, users, and content changes."
        icon="policy"
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-[#eaddec] bg-white px-4 py-2.5 text-sm font-semibold text-[#3e004c] shadow-sm transition-colors hover:bg-[#fbf7fc]">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Refresh
          </button>
        }
      />

      <div className="mb-4 grid gap-3 rounded-2xl border border-white/70 bg-white p-4 shadow-[0_14px_35px_rgba(62,0,76,0.07)] md:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-gray-500">Action</span>
          <select value={action} onChange={(event) => setAction(event.target.value)} className={adminCompactInputClass}>
            {ACTIONS.map((item) => <option key={item} value={item}>{item || 'All actions'}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-gray-500">Entity</span>
          <select value={entityType} onChange={(event) => setEntityType(event.target.value)} className={adminCompactInputClass}>
            {ENTITY_TYPES.map((item) => <option key={item} value={item}>{item || 'All entities'}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-gray-500">Actor</span>
          <input
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            placeholder="Email or user id"
            className={adminCompactInputClass}
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{auditLogs.length} entries</p>
            <p className="text-xs text-gray-400">Newest security events first.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-gray-300">manage_search</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fbf7fc] text-xs uppercase tracking-[0.14em] text-gray-500">
              <tr>
                <th className="px-5 py-3.5 text-left font-semibold">Time</th>
                <th className="px-5 py-3.5 text-left font-semibold">Actor</th>
                <th className="px-5 py-3.5 text-left font-semibold">Action</th>
                <th className="px-5 py-3.5 text-left font-semibold">Entity</th>
                <th className="px-5 py-3.5 text-left font-semibold">IP</th>
                <th className="px-5 py-3.5 text-left font-semibold">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-400">Loading...</td></tr>
              ) : auditLogs.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-400">No audit entries found.</td></tr>
              ) : auditLogs.map((row) => (
                <tr key={row.id} className="border-t border-gray-100 align-top transition-colors hover:bg-[#fcf9fd]">
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-4">
                    <p className="max-w-[220px] truncate font-medium text-gray-800">{row.actorEmail ?? 'Unknown actor'}</p>
                    {row.actorId && <p className="max-w-[220px] truncate text-xs text-gray-400">{row.actorId}</p>}
                  </td>
                  <td className="px-5 py-4"><AdminStatusBadge status={row.action} /></td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">{row.entityType.replace(/_/g, ' ')}</p>
                    {row.entityId && <p className="max-w-[220px] truncate text-xs text-gray-400">{row.entityId}</p>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500">{row.ipAddress ?? '-'}</td>
                  <td className="min-w-[280px] px-5 py-4">
                    {row.metadata ? (
                      <details className="group rounded-xl border border-gray-100 bg-[#fbf7fc]">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[#3e004c]">View details</summary>
                        <pre className="max-h-72 overflow-auto border-t border-gray-100 px-3 py-2 text-[11px] leading-5 text-gray-600">{formatMetadata(row.metadata)}</pre>
                      </details>
                    ) : (
                      <span className="text-xs text-gray-400">No details</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
