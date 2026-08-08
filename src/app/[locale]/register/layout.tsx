import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Account',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children
}
