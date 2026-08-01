'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const ADMIN_SW_RELOAD_KEY = 'beninfy-admin-sw-reloaded'

export default function PWAUpdater() {
  const pathname = usePathname()
  const isAdminRoute = pathname.includes('/admin')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production' || isAdminRoute) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => {
          if (!isAdminRoute) return
          if (!navigator.serviceWorker.controller) return
          if (window.sessionStorage.getItem(ADMIN_SW_RELOAD_KEY) === '1') return

          window.sessionStorage.setItem(ADMIN_SW_RELOAD_KEY, '1')
          window.location.reload()
        })
        .catch(() => {})
      return
    }

    window.sessionStorage.removeItem(ADMIN_SW_RELOAD_KEY)

    let refreshing = false

    const handleControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.update().catch(() => {})

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (!worker) return

          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch(() => {})

    return () => {
      refreshing = true
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [isAdminRoute])

  return null
}
