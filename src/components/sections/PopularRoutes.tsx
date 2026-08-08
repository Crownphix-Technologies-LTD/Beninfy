'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { motion, type Variants } from 'framer-motion'
import { routes } from '@/data/routes'
import { getRouteBasePrice } from '@/data/pricing'
import { formatNGN } from '@/lib/utils'

const ROUTE_IMAGES: Record<string, string> = {
  'lagos-cotonou': '/images/routes/lagos-cotonou.jpg',
  'cotonou-togo': '/images/routes/cotonou-lome.jpg',
  'togo-ghana': '/images/routes/lome-accra.jpg',
  'lagos-togo':
    'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=800&q=80',
  'lagos-ghana':
    'https://images.unsplash.com/photo-1505155485412-30b3a45080ec?auto=format&fit=crop&w=800&q=80',
}

const ROUTE_BADGES: Record<string, string> = {
  'lagos-cotonou': 'Daily Departures',
  'cotonou-togo': 'Express Transit',
  'togo-ghana': 'Coastal Route',
  'lagos-togo': 'Multi-Border',
  'lagos-ghana': 'Long Haul Comfort',
}

const popularRoutes = routes.filter((r) => r.popular)

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

const cardVariant: Variants = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

export default function PopularRoutes() {
  const locale = useLocale()
  const t = useTranslations('routes')
  return (
    <section className="py-20 max-w-[1280px] mx-auto px-4 md:px-10 mt-8">
      {/* Section header */}
      <motion.div
        className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <span className="text-primary text-label-md tracking-widest uppercase">
            {t('sectionBadge')}
          </span>
          <h2 className="text-headline-lg mt-2">{t('sectionTitle')}</h2>
        </div>
        <Link
          href={`/${locale}/rides`}
          className="text-primary text-label-md flex items-center gap-1 hover:underline whitespace-nowrap"
        >
          {t('viewAllShort')}
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </Link>
      </motion.div>

      {/* Routes grid */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-8"
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
      >
        {popularRoutes.map((route) => (
          <motion.div
            key={route.id}
            variants={cardVariant}
            className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow border border-outline-variant group"
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
          >
            {/* Image */}
            <div className="h-48 overflow-hidden relative">
              <Image
                src={ROUTE_IMAGES[route.id] ?? ROUTE_IMAGES['lagos-cotonou']}
                alt={`${route.from} to ${route.to}`}
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-label-sm text-primary">
                {ROUTE_BADGES[route.id]}
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="flex justify-between items-center mb-2">
                <Link href={`/${locale}/routes/${route.id}`} className="text-headline-sm hover:text-primary">
                  {route.from} → {route.to}
                </Link>
                <span className="text-secondary text-headline-sm">
                  {formatNGN(getRouteBasePrice(route.id))}
                </span>
              </div>
              <p className="text-on-surface-variant text-body-sm mb-4">
                {t('durationLabel')}: ~{route.durationHours}h &nbsp;|&nbsp; {t('vehicleType')}
              </p>
              <Link
                href={`/${locale}/rides?from=${route.from}&to=${route.to}`}
                className="block w-full py-3 rounded-lg border border-primary text-primary text-label-md text-center hover:bg-primary-container hover:text-on-primary-container transition-all"
              >
                {t('bookRoute')}
              </Link>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
