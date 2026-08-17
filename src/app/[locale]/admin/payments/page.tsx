'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatNGN } from '@/lib/utils'
import { AdminPageHeader, AdminStatusBadge } from '@/components/admin/AdminUI'

interface PaymentRow {
  id: string
  reference: string
  status: string
  amountNGN: number
  createdAt: string
  booking: {
    id: string
    from: string
    to: string
    date: string
    priceNGN: number
    user: { id: string; name: string | null; email: string | null } | null
  } | null
}

interface PaymentResolutionRow {
  id: string
  paymentId: string
  bookingId: string
  status: string
  reason: string
  amountNGN: number
  currencyCode: string
  provider: string
  customerMessageCode: string | null
  createdAt: string
  updatedAt: string
  booking: { id: string; from: string; to: string; date: string; status: string }
  customer: { id: string; name: string | null; email: string | null }
  payment: { id: string; reference: string; status: string; amountNGN: number }
}

const STATUSES = ['', 'pending', 'paid', 'failed']
const RESOLUTION_ACTIONS: Record<string, Array<{ action: string; label: string }>> = {
  review_required: [{ action: 'start_review', label: 'Start review' }],
  under_review: [
    { action: 'approve', label: 'Approve' },
    { action: 'reject', label: 'Reject' },
  ],
  approved: [{ action: 'mark_processing', label: 'Mark processing' }],
  processing: [{ action: 'complete', label: 'Complete' }],
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [paymentResolutions, setPaymentResolutions] = useState<PaymentResolutionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [resolutionLoading, setResolutionLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [resolutionActionId, setResolutionActionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    const res = await fetch(`/api/admin/payments?${params.toString()}`)
    const data = await res.json()
    setPayments(data.payments ?? [])
    setLoading(false)
  }, [status])

  const loadPaymentResolutions = useCallback(async () => {
    setResolutionLoading(true)
    const res = await fetch('/api/admin/payment-resolutions')
    const data = await res.json().catch(() => ({}))
    setPaymentResolutions(data.paymentResolutions ?? [])
    setResolutionLoading(false)
  }, [])

  useEffect(() => {
    const fetchPayments = async () => {
      await load()
    }
    void fetchPayments()
  }, [load])
  useEffect(() => {
    const fetchPaymentResolutions = async () => {
      await loadPaymentResolutions()
    }
    void fetchPaymentResolutions()
  }, [loadPaymentResolutions])

  const runResolutionAction = async (id: string, action: string) => {
    setResolutionActionId(id)
    try {
      const res = await fetch(`/api/admin/payment-resolutions/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await loadPaymentResolutions()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setResolutionActionId(null)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Payments"
        description="Review transaction references, payment status, booking links, and customer payment history."
        icon="payments"
        actions={
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-[#eaddec] bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-[#3e004c] focus:ring-2 focus:ring-[#3e004c]/15"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        }
      />

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{payments.length} payments</p>
            <p className="text-xs text-gray-400">Filtered by current payment state.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-gray-300">receipt_long</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#fbf7fc] text-xs uppercase tracking-[0.14em] text-gray-500">
            <tr>
              <th className="text-left px-5 py-3.5 font-semibold">Reference</th>
              <th className="text-left px-5 py-3.5 font-semibold">Customer</th>
              <th className="text-left px-5 py-3.5 font-semibold">Booking</th>
              <th className="text-left px-5 py-3.5 font-semibold">Amount</th>
              <th className="text-left px-5 py-3.5 font-semibold">Status</th>
              <th className="text-left px-5 py-3.5 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-400">Loading...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-400">No payments.</td></tr>
            ) : payments.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 transition-colors hover:bg-[#fcf9fd]">
                <td className="px-5 py-4"><code className="rounded-lg bg-[#fbf7fc] px-2 py-1 text-xs text-gray-700">{p.reference}</code></td>
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-800">{p.booking?.user?.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{p.booking?.user?.email ?? 'guest'}</p>
                </td>
                <td className="px-5 py-4 text-gray-700">{p.booking ? `${p.booking.from} → ${p.booking.to}` : '—'}</td>
                <td className="px-5 py-4 font-semibold text-gray-900">{formatNGN(p.amountNGN)}</td>
                <td className="px-5 py-4">
                  <AdminStatusBadge status={p.status} />
                </td>
                <td className="px-5 py-4 text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{paymentResolutions.length} payment resolutions</p>
            <p className="text-xs text-gray-400">Review refund follow-up cases without executing provider refunds.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-gray-300">rule</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fbf7fc] text-xs uppercase tracking-[0.14em] text-gray-500">
              <tr>
                <th className="px-5 py-3.5 text-left font-semibold">Customer</th>
                <th className="px-5 py-3.5 text-left font-semibold">Booking</th>
                <th className="px-5 py-3.5 text-left font-semibold">Payment</th>
                <th className="px-5 py-3.5 text-left font-semibold">Amount</th>
                <th className="px-5 py-3.5 text-left font-semibold">Status</th>
                <th className="px-5 py-3.5 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {resolutionLoading ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-400">Loading...</td></tr>
              ) : paymentResolutions.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-400">No resolution cases.</td></tr>
              ) : paymentResolutions.map((resolution) => (
                <tr key={resolution.id} className="border-t border-gray-100 align-top transition-colors hover:bg-[#fcf9fd]">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">{resolution.customer.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{resolution.customer.email ?? '—'}</p>
                  </td>
                  <td className="px-5 py-4 text-gray-700">
                    <p>{resolution.booking.from} → {resolution.booking.to}</p>
                    <p className="text-xs text-gray-400">{new Date(resolution.booking.date).toLocaleDateString()}</p>
                  </td>
                  <td className="px-5 py-4">
                    <code className="rounded-lg bg-[#fbf7fc] px-2 py-1 text-xs text-gray-700">{resolution.payment.reference}</code>
                    <p className="mt-1 text-xs text-gray-400">{resolution.provider}</p>
                  </td>
                  <td className="px-5 py-4 font-semibold text-gray-900">{formatNGN(resolution.amountNGN)}</td>
                  <td className="px-5 py-4"><AdminStatusBadge status={resolution.status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      {(RESOLUTION_ACTIONS[resolution.status] ?? []).map((item) => (
                        <button
                          key={item.action}
                          type="button"
                          disabled={resolutionActionId === resolution.id}
                          onClick={() => runResolutionAction(resolution.id, item.action)}
                          className="rounded-lg border border-[#eaddec] bg-white px-3 py-1.5 text-xs font-semibold text-[#3e004c] transition hover:bg-[#fbf7fc] disabled:opacity-50"
                        >
                          {resolutionActionId === resolution.id ? 'Working...' : item.label}
                        </button>
                      ))}
                    </div>
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
