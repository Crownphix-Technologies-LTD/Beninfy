import type { Metadata } from 'next'
import Link from 'next/link'
import { setRequestLocale } from 'next-intl/server'
import { accountDeletionGraceDays } from '@/lib/accountDeletion'
import { accountDeletionCopy } from '@/lib/accountDeletionCopy'
import { siteConfig } from '@/lib/config'
import DeletionRequestForm from '@/components/account-deletion/DeletionRequestForm'
import DeletionPolicy from '@/components/account-deletion/DeletionPolicy'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const copy = accountDeletionCopy[locale === 'fr' ? 'fr' : 'en']
  return {
    title: copy.title,
    description: copy.intro,
    referrer: 'no-referrer',
    alternates: {
      canonical: `https://www.beninfy.com/${locale === 'fr' ? 'fr' : 'en'}/delete-account`,
      languages: {
        en: 'https://www.beninfy.com/en/delete-account',
        fr: 'https://www.beninfy.com/fr/delete-account',
      },
    },
  }
}

export default async function DeleteAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: requested } = await params
  const locale = requested === 'fr' ? 'fr' : 'en'
  setRequestLocale(locale)
  const copy = accountDeletionCopy[locale]
  return (
    <div lang={locale} data-testid="account-deletion-page" className="bg-background mt-16 pb-16">
      <header className="border-outline-variant bg-primary text-on-primary border-b py-12 md:py-16">
        <div className="mx-auto max-w-5xl px-5 md:px-10">
          <nav
            aria-label={locale === 'fr' ? 'Langue' : 'Language'}
            className="mb-8 flex gap-4 text-sm"
          >
            <Link
              href="/en/delete-account"
              hrefLang="en"
              lang="en"
              aria-current={locale === 'en' ? 'page' : undefined}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              English
            </Link>
            <Link
              href="/fr/delete-account"
              hrefLang="fr"
              lang="fr"
              aria-current={locale === 'fr' ? 'page' : undefined}
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              Français
            </Link>
          </nav>
          <p className="mb-3 text-sm font-bold tracking-widest uppercase">Beninfy Customer</p>
          <h1 className="max-w-3xl text-3xl leading-tight font-bold sm:text-4xl">{copy.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed">{copy.intro}</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <DeletionRequestForm locale={locale} />
          <section
            aria-labelledby="deletion-help-title"
            className="bg-surface-container rounded-2xl p-5 sm:p-8"
          >
            <h2 id="deletion-help-title" className="text-headline-sm">
              {copy.helpTitle}
            </h2>
            <p className="mt-3 leading-relaxed">{copy.help}</p>
            <a
              href={`mailto:${siteConfig.contact.email}`}
              className="text-primary mt-3 inline-flex min-h-12 items-center break-all underline underline-offset-4"
            >
              {siteConfig.contact.email}
            </a>
            <div>
              <a
                href={siteConfig.links.whatsapp}
                className="text-primary inline-flex min-h-12 items-center underline underline-offset-4"
              >
                {copy.support} (WhatsApp)
              </a>
            </div>
          </section>
          <section aria-labelledby="deletion-app-title">
            <h2 id="deletion-app-title" className="text-headline-sm mb-3">
              {copy.appTitle}
            </h2>
            <ol className="list-decimal space-y-3 pl-5 leading-relaxed">
              {copy.appSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        </div>
        <div className="min-w-0">
          <DeletionPolicy locale={locale} graceDays={accountDeletionGraceDays()} />
          <Link
            href={`/${locale}/privacy`}
            className="text-primary mt-6 inline-flex min-h-12 items-center underline underline-offset-4"
          >
            {copy.privacy}
          </Link>
        </div>
      </div>
    </div>
  )
}
