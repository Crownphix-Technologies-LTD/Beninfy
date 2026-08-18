'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { AdminPageHeader, AdminModal, adminInputClass, adminLabelClass, adminPrimaryButtonClass, adminSecondaryButtonClass } from '@/components/admin/AdminUI'
import { routes as fallbackRoutes } from '@/data/routes'
import { vehicles as fallbackVehicles } from '@/data/vehicles'
import { formatNGN } from '@/lib/utils'
import { ROUTE_PRICE_SCOPE_OPTIONS, routePriceScopeLabel } from '@/lib/routePriceScopes'

interface RoutePrice {
  id: string
  routeId: string
  vehicleId: string
  pricingScope: string
  amountNGN: number
  notes: string | null
  managedByCategory?: boolean
  route?: { id: string; from: string; to: string }
}

interface RouteOption {
  id: string
  from: string
  to: string
}

interface VehicleOption {
  id: string
  name: string
}

interface FleetVehicleOption {
  id: string
  label: string
  vehicleId: string
  vehicle?: { id: string; name: string }
}

const FALLBACK_ROUTE_OPTIONS = fallbackRoutes.map((route) => ({
  label: `${route.from} → ${route.to}`,
  value: route.id,
}))

const FALLBACK_VEHICLE_OPTIONS = fallbackVehicles.map((vehicle) => ({
  label: vehicle.name,
  value: vehicle.id,
}))

const EMPTY_FORM = {
  routeId: '',
  vehicleId: '',
  pricingScope: 'default',
  amountNGN: '',
  notes: '',
  syncFleetPrices: false,
}

export default function AdminRoutePricesPage() {
  const [routePrices, setRoutePrices] = useState<RoutePrice[]>([])
  const [routeOptions, setRouteOptions] = useState<Array<{ label: string; value: string }>>(FALLBACK_ROUTE_OPTIONS)
  const [vehicleOptions, setVehicleOptions] = useState<Array<{ label: string; value: string }>>(FALLBACK_VEHICLE_OPTIONS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<{ mode: 'create' | 'edit'; item?: RoutePrice } | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const vehicleLabel = (vehicleId: string) => vehicleOptions.find((option) => option.value === vehicleId)?.label ?? vehicleId

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [routeRes, vehicleRes, fleetRes, priceRes] = await Promise.all([
        fetch('/api/admin/routes'),
        fetch('/api/admin/vehicles'),
        fetch('/api/admin/fleet-vehicles'),
        fetch('/api/admin/route-prices'),
      ])

      const routeData = await routeRes.json().catch(() => ({}))
      const vehicleData = await vehicleRes.json().catch(() => ({}))
      const fleetData = await fleetRes.json().catch(() => ({}))
      const priceData = await priceRes.json().catch(() => ({}))

      if (!priceRes.ok) throw new Error(typeof priceData.error === 'string' ? priceData.error : 'Failed to load prices')

      const routes = (routeData.routes ?? [])
        .filter((route: RouteOption) => route.id && route.from && route.to)
        .map((route: RouteOption) => ({ label: `${route.from} → ${route.to}`, value: route.id }))
      const vehicles = (vehicleData.vehicles ?? [])
        .filter((vehicle: VehicleOption) => vehicle.id && vehicle.name)
        .map((vehicle: VehicleOption) => ({ label: vehicle.name, value: vehicle.id }))
      const fleetVehicles = (fleetData.fleetVehicles ?? [])
        .filter((unit: FleetVehicleOption) => unit.id && unit.label)
        .map((unit: FleetVehicleOption) => ({
          label: `${unit.vehicle?.name ?? unit.vehicleId} / ${unit.label}`,
          value: unit.id,
        }))

      if (routes.length > 0) setRouteOptions(routes)
      if (vehicles.length > 0) setVehicleOptions([...vehicles, ...fleetVehicles])
      setRoutePrices((priceData.routePrices ?? []) as RoutePrice[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      await loadData()
    }
    void fetchData()
  }, [loadData])

  const groupedByRoute = useMemo(() => {
    const groups: Record<string, RoutePrice[]> = {}
    for (const price of routePrices) {
      const key = price.route?.id ?? price.routeId
      groups[key] = groups[key] ?? []
      groups[key].push(price)
    }
    return Object.entries(groups).sort(([a, groupA], [b, groupB]) => {
      const labelA = groupA[0]?.route ? `${groupA[0].route.from} → ${groupA[0].route.to}` : a
      const labelB = groupB[0]?.route ? `${groupB[0].route.from} → ${groupB[0].route.to}` : b
      return labelA.localeCompare(labelB)
    })
  }, [routePrices])

  const openCreate = (routeId = '') => {
    setForm({ ...EMPTY_FORM, routeId })
    setOpen({ mode: 'create' })
  }

  const openEdit = (item: RoutePrice) => {
    setForm({
      routeId: item.routeId,
      vehicleId: item.vehicleId,
      pricingScope: item.pricingScope,
      amountNGN: item.amountNGN,
      notes: item.notes ?? '',
      syncFleetPrices: false,
    })
    setOpen({ mode: 'edit', item })
  }

  const close = () => {
    setOpen(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!open) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        routeId: String(form.routeId ?? '').trim(),
        vehicleId: String(form.vehicleId ?? '').trim(),
        pricingScope: String(form.pricingScope ?? 'default'),
        amountNGN: Number(form.amountNGN ?? 0),
        notes: String(form.notes ?? '').trim() || null,
        syncFleetPrices: Boolean(form.syncFleetPrices),
      }
      const url = open.mode === 'create' ? '/api/admin/route-prices' : `/api/admin/route-prices/${open.item?.id}`
      const method = open.mode === 'create' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      await loadData()
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this price?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/route-prices/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Delete failed')
      setRoutePrices((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Route prices"
        description="Group fares by route so admins can quickly edit vehicle categories and scope pricing for each route."
        icon="sell"
        actions={
          <button onClick={() => openCreate()} className={adminPrimaryButtonClass}>
            Add price
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            Loading route prices…
          </div>
        ) : groupedByRoute.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            No route prices found. Use the Add price button to create the first route fare.
          </div>
        ) : (
          groupedByRoute.map(([routeId, prices]) => {
            const routeLabel = prices[0]?.route ? `${prices[0].route.from} → ${prices[0].route.to}` : routeId
            return (
              <section key={routeId} className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_16px_45px_rgba(62,0,76,0.08)]">
                <div className="flex flex-col gap-4 border-b border-gray-100 bg-[#fbf7fc] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Route</p>
                    <h2 className="mt-2 text-lg font-semibold text-[#3e004c]">{routeLabel}</h2>
                    <p className="mt-1 text-sm text-gray-500">{prices.length} price{prices.length === 1 ? '' : 's'} configured</p>
                  </div>
                  <button onClick={() => openCreate(routeId)} className={adminSecondaryButtonClass}>
                    Add price for this route
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-[#fff8fd] text-left text-xs uppercase tracking-[0.16em] text-gray-500">
                      <tr>
                        <th className="px-6 py-4">Category</th>
                        <th className="px-6 py-4">Scope</th>
                        <th className="px-6 py-4">Fare (NGN)</th>
                        <th className="px-6 py-4">Inheritance</th>
                        <th className="px-6 py-4">Notes</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prices.map((price) => (
                        <tr key={price.id} className="border-t border-gray-100 hover:bg-[#fcf9fd]">
                          <td className="px-6 py-4">{vehicleLabel(price.vehicleId)}</td>
                          <td className="px-6 py-4">{routePriceScopeLabel(price.pricingScope)}</td>
                          <td className="px-6 py-4 font-semibold text-gray-900">{formatNGN(price.amountNGN)}</td>
                          <td className="px-6 py-4 text-gray-500">
                            {price.managedByCategory ? 'Category-managed' : 'Explicit'}
                          </td>
                          <td className="px-6 py-4 text-gray-500">{price.notes ?? '—'}</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => openEdit(price)} className="mr-2 inline-flex h-9 items-center justify-center rounded-xl border border-purple-100 bg-white px-3 text-sm font-semibold text-[#3e004c] transition hover:bg-[#f7eff8]">
                              Edit
                            </button>
                            <button onClick={() => handleDelete(price.id)} disabled={deleting === price.id} className="inline-flex h-9 items-center justify-center rounded-xl border border-red-100 bg-white px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                              {deleting === price.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })
        )}
      </div>

      <AdminModal
        open={!!open}
        onClose={close}
        title={open?.mode === 'create' ? 'New route price' : 'Edit route price'}
        eyebrow="Route pricing"
        description="Save route pricing for vehicle categories and booking scopes."
        icon="sell"
        maxWidth="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className={adminSecondaryButtonClass}>Cancel</button>
            <button type="submit" form="route-price-form" disabled={saving} className={adminPrimaryButtonClass}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <form id="route-price-form" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className={adminLabelClass}>Route *</label>
            <select
              value={String(form.routeId ?? '')}
              onChange={(e) => setForm({ ...form, routeId: e.target.value })}
              required
              className={adminInputClass}
            >
              <option value="">Select route</option>
              {routeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={adminLabelClass}>Category *</label>
            <select
              value={String(form.vehicleId ?? '')}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
              required
              className={adminInputClass}
            >
              <option value="">Select category</option>
              {vehicleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={adminLabelClass}>Pricing scope *</label>
            <select
              value={String(form.pricingScope ?? 'default')}
              onChange={(e) => setForm({ ...form, pricingScope: e.target.value })}
              required
              className={adminInputClass}
            >
              {ROUTE_PRICE_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={adminLabelClass}>One-way drop-off fare (NGN) *</label>
            <input
              type="number"
              value={String(form.amountNGN ?? '')}
              onChange={(e) => setForm({ ...form, amountNGN: e.target.value })}
              required
              min={0}
              className={adminInputClass}
            />
          </div>

          <div>
            <label className={adminLabelClass}>Notes</label>
            <textarea
              value={String(form.notes ?? '')}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              className={`${adminInputClass} min-h-28 resize-y`}
              placeholder="Optional internal note, e.g. agency rate or seasonal price"
            />
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-purple-100 bg-[#fbf7fc] p-4 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={Boolean(form.syncFleetPrices)}
              onChange={(e) => setForm({ ...form, syncFleetPrices: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-purple-200 text-[#3e004c]"
            />
            <span>
              <span className="block font-semibold text-[#3e004c]">Sync connected fleet units</span>
              <span className="mt-1 block text-gray-500">
                Overwrite all connected unit prices for this route and scope, then keep them category-managed.
                Leave this off to preserve custom unit overrides.
              </span>
            </span>
          </label>
        </form>
      </AdminModal>
    </div>
  )
}
