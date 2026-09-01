'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  AdminModal,
  AdminPageHeader,
  AdminStatusBadge,
  adminInputClass,
  adminLabelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from '@/components/admin/AdminUI'
import { ADMIN_ROLE_LABELS, type AppRole } from '@/lib/roles'

interface UserRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  image: string | null
  role: AppRole
  disabledAt: string | null
  deletionRequestedAt: string | null
  scheduledDeletionAt: string | null
  deletionCancelledAt: string | null
  anonymizedAt: string | null
  googleLinked: boolean
  createdAt: string
  _count: { bookings: number }
}

const CREATE_ROLE_OPTIONS: AppRole[] = [
  'admin',
  'operations_admin',
  'finance_admin',
  'fleet_admin',
  'pricing_admin',
  'support_admin',
  'content_admin',
  'user',
]

const EDIT_ROLE_OPTIONS: AppRole[] = ['user', ...CREATE_ROLE_OPTIONS.filter((role) => role !== 'user')]

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [viewerRole, setViewerRole] = useState<UserRow['role'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'admin' as AppRole })
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isSuper = viewerRole === 'super_admin'

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const res = await fetch(`/api/admin/users?${params.toString()}`)
    const data = await res.json()
    setUsers(data.users ?? [])
    setViewerRole(data.viewerRole ?? null)
    setLoading(false)
  }, [q])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const setRole = async (id: string, role: UserRow['role']) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Failed to update role')
        return
      }
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role } : u))
    } finally { setBusy(null) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this user? Their bookings remain but become orphaned.')) return
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Failed to delete')
        return
      }
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } finally { setBusy(null) }
  }

  const restoreDeletion = async (id: string) => {
    if (!confirm('Restore this deletion-pending customer account? Old mobile sessions will not be restored.')) return
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/users/${id}/restore-deletion`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Failed to restore account')
        return
      }
      await load()
    } finally { setBusy(null) }
  }

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
          role: form.role,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create user')
        return
      }
      setShowCreate(false)
      setForm({ name: '', email: '', password: '', phone: '', role: 'admin' })
      await load()
    } finally { setSubmitting(false) }
  }

  const submitPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetTarget) return
    setResetError(null)
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResetError(data.error ?? 'Password reset failed')
        return
      }
      setResetTarget(null)
      setResetPassword('')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description={isSuper ? 'Manage customers, admin users, roles, and password resets.' : 'View customer accounts. Role changes require super admin access.'}
        icon="group"
        actions={isSuper ? (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#3e004c] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(62,0,76,0.18)] transition-colors hover:bg-[#50115f]"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Add user
          </button>
        ) : null}
      />

      <div className="mb-4 rounded-2xl border border-white/70 bg-white p-4 shadow-[0_14px_35px_rgba(62,0,76,0.07)]">
        <label className="relative block max-w-xl">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
          <input
            type="search"
            placeholder="Search name or email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-[#fbf7fc] py-3 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-[#3e004c] focus:bg-white focus:ring-2 focus:ring-[#3e004c]/15"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{users.length} users</p>
            <p className="text-xs text-gray-400">Customer and backoffice account directory.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-gray-300">manage_accounts</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#fbf7fc] text-xs uppercase tracking-[0.14em] text-gray-500">
            <tr>
              <th className="text-left px-5 py-3.5 font-semibold">Name</th>
              <th className="text-left px-5 py-3.5 font-semibold">Email</th>
              <th className="text-left px-5 py-3.5 font-semibold">Phone</th>
              <th className="text-left px-5 py-3.5 font-semibold">Identity</th>
              <th className="text-left px-5 py-3.5 font-semibold">Account</th>
              <th className="text-left px-5 py-3.5 font-semibold">Bookings</th>
              <th className="text-left px-5 py-3.5 font-semibold">Joined</th>
              <th className="text-left px-5 py-3.5 font-semibold">Role</th>
              {isSuper && <th className="px-5 py-3.5"></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isSuper ? 9 : 8} className="px-5 py-14 text-center text-gray-400">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={isSuper ? 9 : 8} className="px-5 py-14 text-center text-gray-400">No users.</td></tr>
            ) : users.map((u) => {
              const isThisSuper = u.role === 'super_admin'
              const deletionPending = Boolean(u.deletionRequestedAt && !u.anonymizedAt)
              const accountStatus = u.anonymizedAt
                ? 'Anonymized'
                : deletionPending
                  ? 'Deletion pending'
                  : u.disabledAt
                    ? 'Disabled'
                    : 'Active'
              return (
                <tr key={u.id} className="border-t border-gray-100 transition-colors hover:bg-[#fcf9fd]">
                  <td className="px-5 py-4 font-medium text-gray-800">
                    <div className="flex items-center gap-3">
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.image} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f7eff8] text-xs font-semibold text-[#3e004c]">
                          {(u.name ?? u.email ?? '?').slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span>{u.name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-700">{u.email ?? '—'}</td>
                  <td className="px-5 py-4 text-gray-700">{u.phone ?? '—'}</td>
                  <td className="px-5 py-4">
                    <AdminStatusBadge status={u.googleLinked ? 'Google linked' : 'Password/local'} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1">
                      <AdminStatusBadge status={accountStatus} />
                      {deletionPending && u.scheduledDeletionAt && (
                        <p className="text-[11px] text-gray-500">
                          Due {new Date(u.scheduledDeletionAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-700">{u._count.bookings}</td>
                  <td className="px-5 py-4 text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    {isSuper && !isThisSuper ? (
                      <select
                        value={u.role}
                        onChange={(e) => setRole(u.id, e.target.value as UserRow['role'])}
                        disabled={busy === u.id}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs outline-none focus:border-[#3e004c] focus:ring-2 focus:ring-[#3e004c]/15"
                      >
                        {EDIT_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</option>
                        ))}
                      </select>
                    ) : (
                      <AdminStatusBadge status={ADMIN_ROLE_LABELS[u.role]} />
                    )}
                  </td>
                  {isSuper && (
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      {!isThisSuper && (
                        <>
                          <button
                            onClick={() => {
                              setResetTarget(u)
                              setResetPassword('')
                              setResetError(null)
                            }}
                            disabled={busy === u.id}
                            className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-purple-100 text-[#3e004c] transition-colors hover:bg-[#f7eff8] disabled:opacity-50"
                            title="Reset password"
                          >
                            <span className="material-symbols-outlined text-[17px]">lock_reset</span>
                          </button>
                          <button
                            onClick={() => remove(u.id)}
                            disabled={busy === u.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                            title="Delete user"
                          >
                            <span className="material-symbols-outlined text-[17px]">delete</span>
                          </button>
                          {deletionPending && (
                            <button
                              onClick={() => restoreDeletion(u.id)}
                              disabled={busy === u.id}
                              className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-100 text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                              title="Restore deletion-pending customer"
                            >
                              <span className="material-symbols-outlined text-[17px]">restore</span>
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>

      {showCreate && (
        <AdminModal
          open={showCreate}
          onClose={() => { setShowCreate(false); setError(null) }}
          title="Add user"
          eyebrow="Create account"
          description="Create a team member or customer account."
          icon="person_add"
          maxWidth="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setError(null) }}
                className={adminSecondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="admin-create-user-form"
                disabled={submitting}
                className={adminPrimaryButtonClass}
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          }
        >
          <form id="admin-create-user-form" onSubmit={submitCreate} className="space-y-4">
            <div>
              <label className={adminLabelClass}>Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={adminInputClass}
              />
            </div>
            <div>
              <label className={adminLabelClass}>Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={adminInputClass}
              />
            </div>
            <div>
              <label className={adminLabelClass}>Password</label>
              <input
                required
                type="text"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={`${adminInputClass} font-mono`}
                placeholder="At least 8 chars"
              />
            </div>
            <div>
              <label className={adminLabelClass}>Phone <span className="font-normal text-gray-400">(optional)</span></label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={adminInputClass}
              />
            </div>
            <div>
              <label className={adminLabelClass}>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}
                className={adminInputClass}
              >
                {CREATE_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{ADMIN_ROLE_LABELS[role]}</option>
                ))}
              </select>
            </div>
            {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          </form>
        </AdminModal>
      )}

      {resetTarget && (
        <AdminModal
          open={!!resetTarget}
          onClose={() => { setResetTarget(null); setResetPassword(''); setResetError(null) }}
          title="Reset password"
          eyebrow="Account security"
          description={`Set a new temporary password for ${resetTarget.email ?? resetTarget.name ?? 'this user'}.`}
          icon="lock_reset"
          maxWidth="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setResetTarget(null); setResetPassword(''); setResetError(null) }}
                className={adminSecondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="admin-reset-password-form"
                disabled={resetting}
                className={adminPrimaryButtonClass}
              >
                {resetting ? 'Saving...' : 'Reset password'}
              </button>
            </div>
          }
        >
          <form id="admin-reset-password-form" onSubmit={submitPasswordReset} className="space-y-4">
            <div>
              <label className={adminLabelClass}>New password</label>
              <input
                required
                type="text"
                minLength={8}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className={`${adminInputClass} font-mono`}
                placeholder="At least 8 chars"
              />
            </div>
            {resetError && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{resetError}</p>}
          </form>
        </AdminModal>
      )}
    </div>
  )
}
