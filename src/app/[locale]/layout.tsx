import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import AuthProvider from '@/components/shared/AuthProvider'
import LocaleLayoutShell from '@/components/layout/LocaleLayoutShell'
import LenisProvider from '@/components/shared/LenisProvider'
import type { Metadata } from 'next'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Private Cross-Border Rides Across West Africa',
  description:
    'Book private rides, airport pickups, tours and border-assisted transport across Nigeria, Benin Republic, Togo and Ghana.',
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }
  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
      />
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <LenisProvider />
          <LocaleLayoutShell>{children}</LocaleLayoutShell>
        </ThemeProvider>
      </AuthProvider>
    </NextIntlClientProvider>
  )
}
