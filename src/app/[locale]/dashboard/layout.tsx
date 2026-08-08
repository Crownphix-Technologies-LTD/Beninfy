import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children
}
