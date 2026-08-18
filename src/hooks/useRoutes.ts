'use client'

import { useEffect, useState } from 'react'

export type PublicBookingLocation = {
  city: string
  country: string
}

export type PublicRoute = {
  id: string
  origin: { city: string; code: string; country: string }
  destination: { city: string; code: string; country: string }
  displayName: string
  durationHours: number
  popular: boolean
  image: string
  description: string
  descriptionFr: string
  borderCrossings: string[]
  available: boolean
}

export function useRoutes() {
  const [routes, setRoutes] = useState<PublicRoute[]>([])
  const [locations, setLocations] = useState<PublicBookingLocation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/mobile/v1/routes')
      .then((res) => (res.ok ? res.json() : { routes: [], locations: [] }))
      .then((data: { routes?: PublicRoute[]; locations?: PublicBookingLocation[] }) => {
        if (cancelled) return
        setRoutes(data.routes ?? [])
        setLocations(data.locations ?? [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { routes, locations, loading }
}
