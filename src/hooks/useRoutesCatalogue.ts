'use client'

import { useCallback, useEffect, useState } from 'react'
import type { WebRouteDto } from '@/lib/webRouteSelection'

type CatalogueState = {
  routes: WebRouteDto[]
  loading: boolean
  error: boolean
}

export function useRoutesCatalogue() {
  const [state, setState] = useState<CatalogueState>({ routes: [], loading: true, error: false })
  const [requestVersion, setRequestVersion] = useState(0)

  const retry = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: false }))
    setRequestVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/mobile/v1/routes', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('ROUTES_UNAVAILABLE')
        const body = await response.json()
        return Array.isArray(body?.routes) ? (body.routes as WebRouteDto[]) : []
      })
      .then((routes) => setState({ routes, loading: false, error: false }))
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          setState({ routes: [], loading: false, error: true })
        }
      })
    return () => controller.abort()
  }, [requestVersion])

  return { ...state, retry }
}
