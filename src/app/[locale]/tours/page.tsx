import Link from 'next/link'
import { formatNGN } from '@/lib/utils'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getPublicTours } from '@/lib/tourCatalog'
import CatalogImage from '@/components/shared/CatalogImage'
import { pageMetadata, seoImages } from '@/lib/seo'
import type { Metadata } from 'next'

const TOUR_CATEGORIES: Record<string, string> = {
  'benin-history-lake': 'tagHistory',
  'lome-aneho-beach': 'tagBeach',
  'accra-cape-coast': 'tagGhana',
  'west-africa-grand-tour': 'tagGrand',
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return pageMetadata({
    title: 'Private Tours in Benin, Togo, Ghana and West Africa',
    description:
      'Book curated Beninfy tours to Ganvié, Ouidah, Lomé, Aného Beach, Accra, Cape Coast and multi-country West African destinations.',
    path: 'tours',
    image: seoImages.tours,
    locale,
    keywords: ['Benin Republic tours', 'Togo private tours', 'Ghana tours', 'West Africa private tour'],
  })
}

export const dynamic = 'force-dynamic'

export default async function ToursPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('toursPage')
  const tours = await getPublicTours()

  return (
    <div className="min-h-screen bg-background">
      <main className="mt-16">
        {/* Hero */}
        <section
          className="py-20 text-center relative"
          style={{
            background: "linear-gradient(rgba(62,0,76,0.85), rgba(62,0,76,0.75)), url('https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=1600&q=80') center/cover no-repeat",
          }}
        >
          <div className="max-w-[1280px] mx-auto px-4 md:px-10">
            <span className="text-secondary-container text-label-md tracking-widest uppercase">{t('badge')}</span>
            <h1 className="text-display-lg text-white mt-3 mb-4">{t('title')}</h1>
            <p className="text-body-lg text-white/80 max-w-2xl mx-auto">
              {t('subtitle')}
            </p>
          </div>
        </section>

        {/* Tours grid */}
        <section className="max-w-[1280px] mx-auto px-4 md:px-10 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {tours.map((tour) => (
              <div
                key={tour.id}
                className="bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant shadow-sm hover:shadow-xl transition-shadow group"
              >
                <div className="h-64 overflow-hidden relative">
                  <CatalogImage
                    src={tour.image}
                    alt={tour.title}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 bg-secondary text-on-secondary px-3 py-1 rounded-full text-label-sm">
                    {t(TOUR_CATEGORIES[tour.id] as 'tagHistory' | 'tagBeach' | 'tagGhana' | 'tagGrand')}
                  </div>
                  <div className="absolute top-4 right-4 bg-surface-container-lowest/90 backdrop-blur-sm px-3 py-1 rounded-full text-label-sm text-primary">
                    {tour.durationDays} {t('days')}
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-headline-sm text-on-surface">{tour.title}</h2>
                    <span className="text-secondary text-headline-sm shrink-0 ml-2">
                      {t('from')} {formatNGN(tour.startingFromNGN)}
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-body-sm mb-4">{tour.description}</p>

                  <div className="flex items-center gap-4 mb-5 text-label-md text-on-surface-variant">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px] text-primary">location_on</span>
                      {tour.destination}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
                      {tour.durationDays} {t('days')}
                    </div>
                  </div>

                  <ul className="space-y-1.5 mb-6">
                    {tour.highlights.slice(0, 3).map((h) => (
                      <li key={h} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-primary icon-fill text-[16px]">check_circle</span>
                        {h}
                      </li>
                    ))}
                  </ul>

                  <div className="flex gap-3">
                    <Link
                      href={`/${locale}/tours/${tour.id}`}
                      className="flex-1 bg-primary text-on-primary py-3 rounded-xl text-label-md text-center hover:opacity-95 active:scale-[0.98] transition-all"
                    >
                      {t('viewPackage')}
                    </Link>
                    <Link
                      href={`/${locale}/rides`}
                      className="px-5 border-2 border-secondary text-secondary rounded-xl text-label-md text-center hover:bg-secondary-container/20 transition-colors flex items-center"
                    >
                      {t('bookTransport')}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 bg-primary-container rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-headline-md text-on-primary mb-2">{t('customTitle')}</h3>
              <p className="text-on-primary-container/80 text-body-md">
                {t('customDesc')}
              </p>
            </div>
            <Link
              href={`/${locale}/about#contact`}
              className="shrink-0 bg-surface-container-lowest text-primary px-8 py-4 rounded-xl text-label-md hover:shadow-md transition-all whitespace-nowrap"
            >
              {t('contactUs')}
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
