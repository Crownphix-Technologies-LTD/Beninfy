'use client'

import { useEffect, useState } from 'react'
import { getFleetVehicleDisplayLabel } from '@/lib/fleetDisplay'

export interface PublicFleetVehicle {
  id: string
  vehicleId: string
  label: string
  displayLabel: string
  color: string | null
  currentCity: string | null
  vehicle?: {
    id: string
    name: string
    image: string | null
    capacity: number
    luggageCapacity: number
    description: string | null
    features: string[]
  }
}

type UseFleetVehiclesOptions = {
  vehicleId?: string
  date?: string
  returnDate?: string
  enabled?: boolean
}

export function useFleetVehicles(options: UseFleetVehiclesOptions = {}) {
  const [fleetVehicles, setFleetVehicles] = useState<PublicFleetVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const { vehicleId, date, returnDate, enabled = true } = options

  useEffect(() => {
    let cancelled = false

    async function loadFleetVehicles() {
      if (!enabled) {
        if (!cancelled) {
          setFleetVehicles([])
          setLoading(false)
        }
        return
      }

      const params = new URLSearchParams()
      if (vehicleId) params.set('vehicleId', vehicleId)
      if (date) params.set('date', date)
      if (returnDate) params.set('returnDate', returnDate)

      setLoading(true)

      try {
        const res = await fetch(`/api/fleet-vehicles${params.size > 0 ? `?${params.toString()}` : ''}`)
        const data: { fleetVehicles?: PublicFleetVehicle[] } = res.ok
          ? await res.json()
          : { fleetVehicles: [] }

        if (cancelled) return

        setFleetVehicles(
          (data.fleetVehicles ?? []).map((unit) => ({
            ...unit,
            displayLabel: unit.displayLabel ?? getFleetVehicleDisplayLabel(unit.label),
          }))
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadFleetVehicles()

    return () => {
      cancelled = true
    }
  }, [vehicleId, date, returnDate, enabled])

  return { fleetVehicles, loading }
}
