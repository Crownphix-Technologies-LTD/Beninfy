import Link from 'next/link'
import { tourDailyRates, packageRates } from '@/data/pricing'
import { formatNGN } from '@/lib/utils'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPublicVehicles } from '@/lib/vehicleCatalog'
import CatalogImage from '@/components/shared/CatalogImage'
import { pageMetadata, seoImages } from '@/lib/seo'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return pageMetadata({
    title: 'Premium Fleet for Private Cross-Border Travel',
    description:
      'Explore Beninfy saloon cars, SUVs, Sienna vans, Prado/GX460 VIP vehicles and Sprinter buses for private rides across West Africa.',
    path: 'fleet',
    image: seoImages.fleet,
    locale,
    keywords: ['Beninfy fleet', 'private car hire West Africa', 'SUV transport Lagos Cotonou', 'VIP cross-border vehicle'],
  })
}

export const dynamic = 'force-dynamic'

export default async function FleetPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('fleetPage')
  const vehicles = await getPublicVehicles()
  return (
    <div className="min-h-screen bg-background">
      <main className="mt-16">
        {/* Hero */}
        <section className="py-20 text-center bg-surface-container-low">
          <div className="max-w-[1280px] mx-auto px-4 md:px-10">
            <h1 className="text-display-lg text-primary mb-4">{t('heroTitle')}</h1>
            <p className="text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              {t('heroSubtitle')}
            </p>
          </div>
        </section>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-4 py-10 px-4 border-b border-outline-variant">
          {[
            { icon: 'verified_user', label: t('badgeVerified') },
            { icon: 'security', label: t('badgeSecurity') },
            { icon: 'ac_unit', label: t('badgeClimate') },
            { icon: 'wifi', label: t('badgeConnectivity') },
            { icon: 'assignment_ind', label: t('badgeBorder') },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 bg-primary/5 px-4 py-2 rounded-full border border-primary/10">
              <span className="material-symbols-outlined text-primary icon-fill text-[18px]">{icon}</span>
              <span className="text-label-md text-primary">{label}</span>
            </div>
          ))}
        </div>

        {/* Fleet grid */}
        <section className="max-w-[1280px] mx-auto px-4 md:px-10 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {vehicles.map((v) => (
            <div
              key={v.id}
              id={v.id}
              className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant shadow-sm hover:shadow-xl transition-shadow flex flex-col group"
            >
              {/* Image */}
              <div className="h-56 relative overflow-hidden bg-surface-container">
                <CatalogImage
                  src={v.image}
                  alt={v.name}
                  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {v.badge && (
                  <div className="absolute bottom-4 left-4 bg-primary/90 text-on-primary px-3 py-1 rounded-lg text-label-sm">
                    {v.badge}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-6 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-3">
                  <h2 className="text-headline-sm text-on-surface">{v.name}</h2>
                  <span className="text-secondary text-label-md">From {formatNGN(tourDailyRates[v.id] ?? v.basePriceNGN ?? 0)}/day</span>
                </div>
                <p className="text-on-surface-variant text-body-sm mb-5 flex-1">{v.description}</p>

                {/* Specs */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">person</span>
                    <span className="text-label-md">{v.capacity} {t('passengers')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">luggage</span>
                    <span className="text-label-md">{v.luggageCapacity} {t('bags')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">ac_unit</span>
                    <span className="text-label-md">{t('fullAC')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">verified_user</span>
                    <span className="text-label-md">{t('borderProtocol')}</span>
                  </div>
                </div>

                {/* Pricing tiers */}
                <div className="bg-surface-container rounded-xl p-4 mb-5 space-y-2">
                  <div className="flex justify-between text-label-sm">
                    <span className="text-on-surface-variant">{t('dailyRate')}</span>
                    <span className="text-secondary font-semibold">{formatNGN(tourDailyRates[v.id] ?? v.basePriceNGN ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-label-sm">
                    <span className="text-on-surface-variant">{t('packageRate')}</span>
                    <span className="text-secondary font-semibold">{formatNGN(packageRates[v.id] ?? v.basePriceNGN ?? 0)}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-1.5 mb-6">
                  {v.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-primary icon-fill text-[16px]">check_circle</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/${locale}/rides`}
                  className="block w-full border-2 border-secondary text-secondary py-3 rounded-xl text-label-md text-center hover:bg-secondary-container/20 transition-colors"
                >
                  {t('bookVehicle')}
                </Link>
              </div>
            </div>
          ))}
        </section>

        {/* Bottom CTA */}
        <section className="bg-primary py-16 text-center">
          <div className="max-w-[1280px] mx-auto px-4 md:px-10">
            <h2 className="text-headline-lg text-on-primary mb-4">{t('customTitle')}</h2>
            <p className="text-on-primary/80 text-body-lg mb-8 max-w-xl mx-auto">
              {t('customDesc')}
            </p>
            <Link
              href={`/${locale}/about#contact`}
              className="inline-flex items-center gap-2 bg-secondary text-on-secondary px-10 py-4 rounded-xl text-headline-sm hover:bg-secondary-container hover:text-on-secondary-container transition-all"
            >
              {t('contactUs')}
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
