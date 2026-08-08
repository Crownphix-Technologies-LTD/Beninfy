import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { signOut } from '@/lib/auth'
import { setRequestLocale } from 'next-intl/server'
import AdminSidebar from '@/components/admin/AdminSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin Backoffice',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
}

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!session?.user?.id) redirect(`/${locale}/admin-login`)
  if (role !== 'admin' && role !== 'super_admin') redirect(`/${locale}/dashboard`)

  const signOutSlot = (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: `/${locale}/login` })
      }}
    >
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
      >
        <span className="material-symbols-outlined text-[16px]">logout</span>
        Sign out
      </button>
    </form>
  )

  return (
    <div className="min-h-screen lg:flex" style={{ background: '#f4f2f8' }}>
      <AdminSidebar
        locale={locale}
        user={{
          name: session.user.name,
          email: session.user.email,
          role,
        }}
        signOutSlot={signOutSlot}
      />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 md:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  )
}
