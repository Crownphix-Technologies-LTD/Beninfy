'use client'

import { useEffect, useState } from 'react'
import type { RoutePriceOverrides } from '@/data/pricing'

export function useRoutePriceOverrides(routeId?: string) {
  const [overrides, setOverrides] = useState<RoutePriceOverrides>({})
  const [request, setRequest] = useState({ routeId, loading: true })
  // Reset pending state when the input changes, before React commits this render.
  // The effect only publishes asynchronous completion for its own active request.
  if (request.routeId !== routeId) setRequest({ routeId, loading: true })
  const loading = request.routeId !== routeId || request.loading

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams()
    if (routeId) params.set('routeId', routeId)

    fetch(`/api/route-prices${params.size ? `?${params.toString()}` : ''}`)
      .then((res) => (res.ok ? res.json() : { overrides: {} }))
      .then((data: { overrides?: RoutePriceOverrides }) => {
        if (!cancelled) setOverrides(data.overrides ?? {})
      })
      .catch(() => {
        if (!cancelled) setOverrides({})
      })
      .finally(() => {
        if (!cancelled) setRequest({ routeId, loading: false })
      })

    return () => {
      cancelled = true
    }
  }, [routeId])

  return { overrides, loading }
}
