import Link from 'next/link'
import { borderFees } from '@/data/borderFees'
import { formatNGN } from '@/lib/utils'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return pageMetadata({
    title: 'West Africa Border Crossing Support and Fees',
    description:
      'Understand border assistance, documents and fees for Nigeria-Benin, Benin-Togo and Togo-Ghana private rides with Beninfy.',
    path: 'border-info',
    locale,
    keywords: ['Seme border assistance', 'Hillacondji border', 'Aflao border crossing', 'West Africa border fees'],
  })
}

const COUNTRY_FLAGS: Record<string, string> = {
  'nigeria-benin': '🇳🇬→🇧🇯',
  'benin-togo': '🇧🇯→🇹🇬',
  'togo-ghana': '🇹🇬→🇬🇭',
}

export default async function BorderInfoPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('borderInfoPage')
  return (
    <div className="min-h-screen bg-background">
      <main className="mt-16">
        {/* Hero */}
        <section className="py-20 bg-primary text-center">
          <div className="max-w-[1280px] mx-auto px-4 md:px-10">
            <span className="text-secondary-container text-label-md tracking-widest uppercase">{t('heroBadge')}</span>
            <h1 className="text-display-lg text-on-primary mt-3 mb-4">{t('heroTitle')}</h1>
            <p className="text-on-primary/80 text-body-lg max-w-2xl mx-auto">
              {t('heroSubtitle')}
            </p>
          </div>
        </section>

        {/* What we handle */}
        <section className="py-16 bg-surface-container-low">
          <div className="max-w-[1280px] mx-auto px-4 md:px-10">
            <h2 className="text-headline-lg text-center mb-12">{t('handlesTitle')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: 'assignment_ind', title: t('handle1Title'), desc: t('handle1Desc') },
                { icon: 'speed', title: t('handle2Title'), desc: t('handle2Desc') },
                { icon: 'support_agent', title: t('handle3Title'), desc: t('handle3Desc') },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-primary text-[28px]">{icon}</span>
                  </div>
                  <h3 className="text-headline-sm mb-2">{title}</h3>
                  <p className="text-on-surface-variant text-body-sm">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Border fee cards */}
        <section className="py-20 max-w-[1280px] mx-auto px-4 md:px-10">
          <h2 className="text-headline-lg text-center mb-3">{t('feesTitle')}</h2>
          <p className="text-on-surface-variant text-body-md text-center mb-12 max-w-2xl mx-auto">
            {t('feesSubtitle')}
          </p>

          <div className="space-y-8">
            {borderFees.map((border) => (
              <div
                key={border.id}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden shadow-sm"
              >
                {/* Header */}
                <div className="bg-primary p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">{COUNTRY_FLAGS[border.id]}</div>
                    <div>
                      <h3 className="text-headline-md text-on-primary">{border.country}</h3>
                      <p className="text-on-primary/70 text-label-md">{border.border}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div>
                      <div className="text-label-sm text-on-primary/60">{t('oneWay')}</div>
                      <div className="text-headline-sm text-secondary-container">{formatNGN(border.feePerPersonNGN)}{t('perPerson')}</div>
                    </div>
                    <div>
                      <div className="text-label-sm text-on-primary/60">{t('roundTrip')}</div>
                      <div className="text-headline-sm text-secondary-container">{formatNGN(border.feeRoundTripNGN)}{t('perPerson')}</div>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Services */}
                  <div>
                    <h4 className="text-label-md text-primary mb-3">{t('servicesIncluded')}</h4>
                    <ul className="space-y-2">
                      {border.services.map((s) => (
                        <li key={s} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                          <span className="material-symbols-outlined text-primary icon-fill text-[16px]">check_circle</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Documents required */}
                  <div>
                    <h4 className="text-label-md text-primary mb-3">{t('docsRequired')}</h4>
                    <ul className="space-y-2">
                      {border.documents?.map((d) => (
                        <li key={d} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                          <span className="material-symbols-outlined text-secondary text-[16px]">description</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Tips */}
                {border.tips && border.tips.length > 0 && (
                  <div className="px-6 pb-6">
                    <div className="bg-secondary-container/20 rounded-xl p-4">
                      <h4 className="text-label-md text-secondary mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">lightbulb</span>
                        {t('proTips')}
                      </h4>
                      <ul className="space-y-1.5">
                        {border.tips.map((t) => (
                          <li key={t} className="text-body-sm text-on-surface-variant">• {t}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-surface-container-low py-16 text-center">
          <div className="max-w-[1280px] mx-auto px-4 md:px-10">
            <h2 className="text-headline-lg mb-4">{t('ctaTitle')}</h2>
            <p className="text-on-surface-variant text-body-lg mb-8">
              {t('ctaSubtitle')}
            </p>
            <Link
              href={`/${locale}/rides`}
              className="inline-flex items-center gap-2 bg-primary text-on-primary px-10 py-4 rounded-xl text-headline-sm hover:bg-primary-container hover:text-on-primary-container transition-all"
            >
              {t('ctaButton')}
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
