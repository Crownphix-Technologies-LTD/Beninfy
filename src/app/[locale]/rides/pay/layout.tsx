import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Secure Payment',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function PayLayout({ children }: { children: ReactNode }) {
  return children
}
