import type { ReactNode } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Profile',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children
}
