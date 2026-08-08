import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Passenger Details',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function BookLayout({ children }: { children: ReactNode }) {
  return children
}
