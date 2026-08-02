'use client'

import { SessionProvider } from 'next-auth/react'
import IdleSessionGuard from '@/components/shared/IdleSessionGuard'

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <IdleSessionGuard />
      {children}
    </SessionProvider>
  )
}
