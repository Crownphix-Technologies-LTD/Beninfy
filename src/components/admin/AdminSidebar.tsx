'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type AdminSidebarProps = {
  locale: string
  user: {
    name?: string | null
    email?: string | null
    role?: string | null
  }
  signOutSlot: ReactNode
}

const NAV_GROUPS = [
  {
    label: 'Command',
    items: [
      { href: '', label: 'Overview', icon: 'dashboard', hint: 'Daily pulse' },
      { href: '/bookings', label: 'Bookings', icon: 'event', hint: 'Trips & assignments' },
      { href: '/payments', label: 'Payments', icon: 'payments', hint: 'Collections' },
      { href: '/coupons', label: 'Coupons', icon: 'confirmation_number', hint: 'Discount codes' },
      { href: '/route-prices', label: 'Prices', icon: 'sell', hint: 'Route fares' },
      { href: '/users', label: 'Users', icon: 'group', hint: 'Accounts' },
      { href: '/audit-logs', label: 'Audit logs', icon: 'policy', hint: 'Security trail' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/vehicles', label: 'Categories', icon: 'category', hint: 'Booking buckets' },
      { href: '/fleet-vehicles', label: 'Fleet units', icon: 'garage', hint: 'Cars & plates' },
      { href: '/drivers', label: 'Drivers', icon: 'badge', hint: 'Crew' },
      { href: '/routes', label: 'Routes', icon: 'route', hint: 'Corridors' },
    ],
  },
  {
    label: 'Experience',
    items: [
      { href: '/tours', label: 'Tours', icon: 'travel_explore', hint: 'Packages' },
      { href: '/border-fees', label: 'Border fees', icon: 'currency_exchange', hint: 'Crossings' },
      { href: '/settings', label: 'Settings', icon: 'settings', hint: 'Security' },
    ],
  },
]

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

function roleLabel(role?: string | null) {
  return role === 'super_admin' ? 'Super admin' : 'Admin'
}

function initials(name?: string | null, email?: string | null) {
  const source = name || email || 'Admin'
  return source
    .split(/[ @._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AD'
}

export default function AdminSidebar({ locale, user, signOutSlot }: AdminSidebarProps) {
  const pathname = usePathname()
  const desktopNavRef = useRef<HTMLElement | null>(null)
  const adminBase = `/${locale}/admin`

  const isActive = (href: string) => {
    const target = `${adminBase}${href}`
    if (href === '') return pathname === adminBase
    return pathname === target || pathname.startsWith(`${target}/`)
  }

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return

    const nav = desktopNavRef.current
    if (!nav) return

    let cleanupWheelCheck: (() => void) | undefined

    const runScrollCheck = () => {
      const originalScrollTop = nav.scrollTop
      const canOverflow = nav.scrollHeight > nav.clientHeight

      nav.scrollTop = originalScrollTop + 24
      const canSetScrollTop = nav.scrollTop !== originalScrollTop
      nav.scrollTop = originalScrollTop

      const onWheel = () => {
        const beforeWheelScrollTop = nav.scrollTop
        window.setTimeout(() => {
          const wheelChangedScrollTop = nav.scrollTop !== beforeWheelScrollTop
          console.debug('[AdminSidebar] scroll diagnostic', {
            canOverflow,
            canSetScrollTop,
            wheelChangedScrollTop,
            scrollHeight: nav.scrollHeight,
            clientHeight: nav.clientHeight,
          })
        }, 80)
      }

      console.debug('[AdminSidebar] scroll diagnostic', {
        canOverflow,
        canSetScrollTop,
        scrollHeight: nav.scrollHeight,
        clientHeight: nav.clientHeight,
      })

      nav.addEventListener('wheel', onWheel, { passive: true, once: true })
      cleanupWheelCheck = () => nav.removeEventListener('wheel', onWheel)
    }

    const frame = window.requestAnimationFrame(runScrollCheck)
    return () => {
      window.cancelAnimationFrame(frame)
      cleanupWheelCheck?.()
    }
  }, [])

  return (
    <>
      <aside className="hidden min-h-screen w-[292px] shrink-0 border-r border-[#eaddec] bg-[#fcf8fd] p-2 lg:flex xl:p-3">
        <div className="sticky top-2 flex h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_18px_50px_rgba(62,0,76,0.09)] xl:top-3 xl:h-[calc(100dvh-1.5rem)]">
          <div className="relative shrink-0 overflow-hidden border-b border-[#f0e5f2] bg-[#3e004c] px-4 py-4">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,#3e004c_0%,#672875_52%,#e0b94f_140%)]" />
            <div className="relative">
              <Link href={`/${locale}/admin`} className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Image src="/logo.png" alt="Beninfy" width={86} height={58} className="h-9 w-auto object-contain" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">Beninfy</span>
                  <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">Backoffice</span>
                </span>
              </Link>

              <div className="mt-4 rounded-xl border border-[#e0b94f]/35 bg-[#260030] p-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f4d66c]">Control center</p>
                    <p className="mt-1 text-sm font-semibold text-white">Transport ops</p>
                  </div>
                  <span className="material-symbols-outlined text-[22px] text-[#f4d66c]">route</span>
                </div>
              </div>
            </div>
          </div>

          <nav
            ref={desktopNavRef}
            aria-label="Admin navigation"
            tabIndex={0}
            className="admin-sidebar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3"
          >
            {NAV_GROUPS.map((group) => (
              <section key={group.label}>
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={`${adminBase}${item.href}`}
                        className={[
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                          active
                            ? 'bg-[#3e004c] text-white shadow-[0_12px_26px_rgba(62,0,76,0.18)]'
                            : 'text-gray-600 hover:bg-[#f7eff8] hover:text-[#3e004c]',
                        ].join(' ')}
                      >
                        {active && <span className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-[#e0b94f]" />}
                        <span
                          className={[
                            'material-symbols-outlined flex h-9 w-9 items-center justify-center rounded-lg text-[20px]',
                            active ? 'bg-white/14 text-[#f4d66c]' : 'bg-white text-[#7b3f89] shadow-sm group-hover:bg-white',
                          ].join(' ')}
                        >
                          {item.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.label}</span>
                          <span className={active ? 'block truncate text-[11px] text-white/58' : 'block truncate text-[11px] text-gray-400'}>
                            {item.hint}
                          </span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </nav>

          <div className="shrink-0 border-t border-[#f0e5f2] p-3">
            <div className="mb-2 rounded-2xl border border-[#f0e5f2] bg-[#fbf7fc] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3e004c] text-xs font-semibold text-white">
                  {initials(user.name, user.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{user.name ?? 'Admin'}</p>
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{roleLabel(user.role)}</span>
                <span className="material-symbols-outlined text-[17px] text-green-600">verified_user</span>
              </div>
            </div>
            {signOutSlot}
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-40 border-b border-[#eaddec] bg-white/95 px-3 py-3 shadow-sm backdrop-blur lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link href={`/${locale}/admin`} className="flex items-center gap-2">
            <Image src="/logo.png" alt="Beninfy" width={84} height={42} className="h-9 w-auto object-contain" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Backoffice</span>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3e004c] text-xs font-semibold text-white">
            {initials(user.name, user.email)}
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={`${adminBase}${item.href}`}
                className={[
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors',
                  active ? 'bg-[#3e004c] text-white' : 'bg-[#f7eff8] text-[#3e004c]',
                ].join(' ')}
              >
                <span className="material-symbols-outlined text-[17px]">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
