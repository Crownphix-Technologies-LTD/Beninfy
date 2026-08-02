'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  AdminModal,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from '@/components/admin/AdminUI'

export type FieldType = 'text' | 'number' | 'textarea' | 'boolean' | 'array' | 'select'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  // shown only on create
  createOnly?: boolean
}

export interface Column<T> {
  header: string
  render: (item: T) => React.ReactNode
  className?: string
}

interface Props<T extends { id: string }> {
  title: string
  description?: string
  fetchUrl: string
  // returned JSON key, e.g. 'vehicles' for { vehicles: [...] }
  collectionKey: string
  itemKey: string
  createUrl?: string
  itemUrl?: (id: string) => string
  columns: Column<T>[]
  fields?: FieldDef[]
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  defaultValues?: Partial<Record<string, unknown>>
}

export function CrudTable<T extends { id: string } & Record<string, unknown>>({
  title,
  description,
  fetchUrl,
  collectionKey,
  createUrl,
  itemUrl,
  columns,
  fields = [],
  canCreate = true,
  canEdit = true,
  canDelete = true,
  defaultValues = {},
}: Props<T>) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<{ mode: 'create' | 'edit'; item?: T } | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const modalFormId = `${collectionKey}-crud-modal-form`
  const singularTitle = title.endsWith('ies')
    ? `${title.slice(0, -3)}y`
    : title.endsWith('s')
      ? title.slice(0, -1)
      : title

  const pageIcon =
    collectionKey === 'fleetVehicles' ? 'garage' :
    collectionKey === 'vehicles' ? 'category' :
    collectionKey === 'routes' ? 'route' :
    collectionKey === 'routePrices' ? 'sell' :
    collectionKey === 'coupons' ? 'confirmation_number' :
    collectionKey === 'drivers' ? 'badge' :
    collectionKey === 'tours' ? 'travel_explore' :
    collectionKey === 'borderFees' ? 'currency_exchange' :
    'table_view'

  useEffect(() => {
    if (!open || typeof document === 'undefined') return

    const scrollY = window.scrollY
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior

    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.documentElement.style.overscrollBehavior = 'none'

    return () => {
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
      window.scrollTo(0, scrollY)
    }
  }, [open])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(fetchUrl)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to load')
      setItems((data[collectionKey] ?? []) as T[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [fetchUrl, collectionKey])

  useEffect(() => {
    const fetchData = async () => {
      await load()
    }
    void fetchData()
  }, [load])

  const openCreate = () => {
    const initial: Record<string, unknown> = { ...defaultValues }
    for (const f of fields) {
      if (initial[f.name] === undefined) {
        if (f.type === 'boolean') initial[f.name] = false
        else if (f.type === 'array') initial[f.name] = ''
        else if (f.type === 'number') initial[f.name] = ''
        else if (f.type === 'select') initial[f.name] = f.options?.[0]?.value ?? ''
        else initial[f.name] = ''
      } else if (f.type === 'array' && Array.isArray(initial[f.name])) {
        initial[f.name] = (initial[f.name] as string[]).join('\n')
      }
    }
    setForm(initial)
    setOpen({ mode: 'create' })
  }

  const openEdit = (item: T) => {
    const initial: Record<string, unknown> = {}
    for (const f of fields) {
      const v = item[f.name]
      if (f.type === 'array') initial[f.name] = Array.isArray(v) ? (v as string[]).join('\n') : ''
      else if (f.type === 'boolean') initial[f.name] = !!v
      else if (v === null || v === undefined) initial[f.name] = ''
      else initial[f.name] = v
    }
    setForm(initial)
    setOpen({ mode: 'edit', item })
  }

  const close = () => { setOpen(null); setForm({}) }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!open) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {}
      for (const f of fields) {
        const raw = form[f.name]
        if (open.mode === 'edit' && f.createOnly) continue
        if (f.type === 'number') {
          if (raw === '' || raw === null || raw === undefined) {
            if (f.required) throw new Error(`${f.label} required`)
            continue
          }
          const n = Number(raw)
          if (Number.isNaN(n)) throw new Error(`${f.label} must be a number`)
          payload[f.name] = n
        } else if (f.type === 'boolean') {
          payload[f.name] = !!raw
        } else if (f.type === 'array') {
          const list = String(raw ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
          payload[f.name] = list
        } else {
          const s = String(raw ?? '').trim()
          if (!s && f.required) throw new Error(`${f.label} required`)
          payload[f.name] = s === '' ? null : s
        }
      }
      const url = open.mode === 'create' ? createUrl! : itemUrl!(open.item!.id)
      const method = open.mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      await load()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this item?')) return
    setDeleting(id)
    try {
      const res = await fetch(itemUrl!(id), { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Delete failed')
      setItems((prev) => prev.filter((x) => x.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title={title}
        description={description}
        icon={pageIcon}
        actions={canCreate && createUrl ? (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#3e004c] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(62,0,76,0.18)] transition-colors hover:bg-[#50115f]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New
          </button>
        ) : null}
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <p>{error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{items.length} records</p>
            <p className="text-xs text-gray-400">Manage, edit, and audit this dataset.</p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-gray-300">database</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fbf7fc] text-xs uppercase tracking-[0.14em] text-gray-500">
              <tr>
                {columns.map((c) => (
                  <th key={c.header} className={`text-left px-5 py-3.5 font-semibold ${c.className ?? ''}`}>{c.header}</th>
                ))}
                {(canEdit || canDelete) && <th className="px-5 py-3.5"></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length + 1} className="px-5 py-14 text-center text-gray-400">Loading...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="px-5 py-14 text-center text-gray-400">No items.</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="border-t border-gray-100 align-top transition-colors hover:bg-[#fcf9fd]">
                  {columns.map((c) => (
                    <td key={c.header} className={`px-5 py-4 ${c.className ?? ''}`}>{c.render(item)}</td>
                  ))}
                  {(canEdit || canDelete) && (
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      {canEdit && itemUrl && (
                        <button onClick={() => openEdit(item)} className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-purple-100 text-[#3e004c] transition-colors hover:bg-[#f7eff8]" title="Edit">
                          <span className="material-symbols-outlined text-[17px]">edit</span>
                        </button>
                      )}
                      {canDelete && itemUrl && (
                        <button onClick={() => handleDelete(item.id)} disabled={deleting === item.id} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50" title="Delete">
                          <span className="material-symbols-outlined text-[17px]">{deleting === item.id ? 'more_horiz' : 'delete'}</span>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <AdminModal
          open={!!open}
          onClose={close}
          title={open.mode === 'create' ? `New ${singularTitle}` : `Edit ${singularTitle}`}
          eyebrow={open.mode === 'create' ? 'Create record' : 'Edit record'}
          description="Complete the fields below, then save your changes."
          icon={pageIcon}
          maxWidth="xl"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className={adminSecondaryButtonClass}>Cancel</button>
              <button type="submit" form={modalFormId} disabled={saving} className={adminPrimaryButtonClass}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          }
        >
          <form id={modalFormId} onSubmit={handleSave} className="space-y-4">
            {fields.map((f) => {
              if (open.mode === 'edit' && f.createOnly) return null
              const value = form[f.name] ?? ''
              if (f.type === 'textarea') {
                return (
                  <div key={f.name}>
                    <label className={adminLabelClass}>{f.label}{f.required && ' *'}</label>
                    <textarea
                      value={String(value)}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      rows={4}
                      className={`${adminInputClass} min-h-28 resize-y`}
                      placeholder={f.placeholder}
                    />
                  </div>
                )
              }
              if (f.type === 'array') {
                return (
                  <div key={f.name}>
                    <label className={adminLabelClass}>{f.label} <span className="font-normal text-gray-400">(one per line)</span></label>
                    <textarea
                      value={String(value)}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      rows={4}
                      className={`${adminInputClass} min-h-28 resize-y`}
                      placeholder={f.placeholder}
                    />
                  </div>
                )
              }
              if (f.type === 'boolean') {
                return (
                  <label key={f.name} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-[#fbf7fc] px-4 py-3 text-sm font-medium text-gray-700">
                    <span>{f.label}</span>
                    <input
                      type="checkbox"
                      checked={!!value}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })}
                      className="h-5 w-5 rounded border-gray-300 text-[#3e004c]"
                    />
                  </label>
                )
              }
              if (f.type === 'select') {
                return (
                  <div key={f.name}>
                    <label className={adminLabelClass}>{f.label}{f.required && ' *'}</label>
                    <select
                      value={String(value)}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      required={f.required && open.mode === 'create'}
                      className={adminInputClass}
                    >
                      {f.options?.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                )
              }
              return (
                <div key={f.name}>
                  <label className={adminLabelClass}>{f.label}{f.required && ' *'}</label>
                  <input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={String(value)}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                    required={f.required && open.mode === 'create'}
                    className={adminInputClass}
                    placeholder={f.placeholder}
                  />
                </div>
              )
            })}
          </form>
        </AdminModal>
      )}
    </div>
  )
}
