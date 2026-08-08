import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Booking Confirmation',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function ConfirmedLayout({ children }: { children: ReactNode }) {
  return children
}
