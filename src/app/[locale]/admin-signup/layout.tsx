import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin Onboarding',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function AdminSignupLayout({ children }: { children: ReactNode }) {
  return children
}
