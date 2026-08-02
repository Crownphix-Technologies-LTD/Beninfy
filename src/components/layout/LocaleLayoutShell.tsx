'use client'

import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import BottomNav from '@/components/layout/BottomNav'
import PageTransition from '@/components/shared/PageTransition'
import SupportBot from '@/components/support/SupportBot'
import { cn } from '@/lib/utils'

const AUTH_PAGES = ['/login', '/register', '/admin-login', '/admin-signup']

export default function LocaleLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { status } = useSession()
  const isAuthPage = AUTH_PAGES.some((p) => pathname.endsWith(p))
  const isAdmin = pathname.includes('/admin')
  const showBottomNav = status === 'authenticated'

  if (isAuthPage) {
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        <PageTransition>{children}</PageTransition>
      </div>
    )
  }

  if (isAdmin) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <Navbar />
      <main className={cn('flex-1', showBottomNav && 'pb-16 md:pb-0')}>
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
      <BottomNav />
      <SupportBot />
    </div>
  )
}
