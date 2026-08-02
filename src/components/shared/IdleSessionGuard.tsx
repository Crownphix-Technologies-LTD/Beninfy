'use client'

import { getSession, signOut, useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { isAdminRole } from '@/lib/roles'

const idleTimeoutMs = Number(process.env.NEXT_PUBLIC_AUTH_IDLE_TIMEOUT_SECONDS ?? 5 * 60) * 1000
const refreshThrottleMs = 60 * 1000
const lastActivityKey = 'beninfy:last-auth-activity'
const idleLogoutKey = 'beninfy:idle-logout'

function now() {
  return Date.now()
}

function readLastActivity() {
  const value = window.localStorage.getItem(lastActivityKey)
  const parsed = value ? Number(value) : 0
  return Number.isFinite(parsed) && parsed > 0 ? parsed : now()
}

export default function IdleSessionGuard() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const lastRefreshRef = useRef(0)
  const signingOutRef = useRef(false)
  const sessionRole = (session?.user as { role?: string } | undefined)?.role

  useEffect(() => {
    if (status !== 'authenticated') return

    const redirectTo = isAdminRole(sessionRole)
      ? `/${pathname.split('/')[1] || 'en'}/admin-login`
      : `/${pathname.split('/')[1] || 'en'}/login`

    const logout = () => {
      if (signingOutRef.current) return
      signingOutRef.current = true
      window.localStorage.setItem(idleLogoutKey, String(now()))
      void signOut({ redirectTo })
    }

    const refreshIfNeeded = () => {
      const currentTime = now()
      if (currentTime - lastRefreshRef.current < refreshThrottleMs) return
      lastRefreshRef.current = currentTime
      void getSession()
    }

    const markActivity = () => {
      const currentTime = now()
      const lastActivity = readLastActivity()
      if (currentTime - lastActivity >= idleTimeoutMs) {
        logout()
        return
      }
      window.localStorage.setItem(lastActivityKey, String(currentTime))
      refreshIfNeeded()
    }

    const checkIdle = () => {
      if (now() - readLastActivity() >= idleTimeoutMs) logout()
    }

    window.localStorage.setItem(lastActivityKey, String(now()))
    refreshIfNeeded()

    const activityEvents: Array<keyof WindowEventMap> = [
      'click',
      'keydown',
      'mousemove',
      'pointerdown',
      'scroll',
      'touchstart',
    ]

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markActivity, { passive: true })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkIdle()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === idleLogoutKey && event.newValue) logout()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('storage', onStorage)
    const interval = window.setInterval(checkIdle, 15 * 1000)

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, markActivity)
      }
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('storage', onStorage)
      window.clearInterval(interval)
    }
  }, [pathname, sessionRole, status])

  return null
}
