import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { getPublicRouteById, getPublicRoutes } from '@/lib/routeCatalog'
import { getRouteStartingPriceNGN } from '@/lib/bookingPricing'
import { formatNGN } from '@/lib/utils'
import { pageMetadata, routeSeoImage, routeServiceJsonLd } from '@/lib/seo'

type Props = {
  params: Promise<{ locale: string; routeId: string }>
}

export async function generateStaticParams() {
  const routes = await getPublicRoutes()
  return ['en', 'fr'].flatMap((locale) => routes.map((route) => ({ locale, routeId: route.id })))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, routeId } = await params
  const route = await getPublicRouteById(routeId)
  if (!route) return {}

  return pageMetadata({
    title: `${route.from} to ${route.to} Private Ride`,
    description:
      route.description ??
      `Book private cross-border transport from ${route.from} to ${route.to} with Beninfy Rides.`,
    path: `routes/${route.id}`,
    image: routeSeoImage(route.id, route.image),
    locale,
    keywords: [
      `${route.from} to ${route.to}`,
      `${route.from} ${route.to} private car`,
      `${route.fromCountry} to ${route.toCountry} transport`,
      'Beninfy Rides',
      'cross-border transport West Africa',
    ],
  })
}

export default async function RouteLandingPage({ params }: Props) {
  const { locale, routeId } = await params
  setRequestLocale(locale)
  const route = await getPublicRouteById(routeId)
  if (!route) notFound()

  const bookHref = `/${locale}/rides?from=${encodeURIComponent(route.from)}&to=${encodeURIComponent(route.to)}`
  const basePrice = await getRouteStartingPriceNGN(route.id)
  const image = routeSeoImage(route.id, route.image)

  return (
    <main className="mt-16 bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(routeServiceJsonLd(route)) }}
      />
      <section className="relative overflow-hidden bg-primary text-on-primary">
        <div className="absolute inset-0 opacity-35">
          <Image
            src={image}
            alt={`${route.from} to ${route.to}`}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary/55" />
        <div className="relative mx-auto grid max-w-[1280px] gap-10 px-4 py-20 md:grid-cols-[1.25fr_.75fr] md:px-10 md:py-24">
          <div>
            <p className="mb-4 text-label-md font-bold uppercase tracking-[0.18em] text-secondary-container">
              Private Cross-Border Ride
            </p>
            <h1 className="max-w-3xl text-display-md md:text-display-lg">
              {route.from} to {route.to}
            </h1>
            <p className="mt-5 max-w-2xl text-body-lg leading-relaxed text-on-primary/82">
              {route.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={bookHref}
                className="inline-flex items-center justify-center rounded-xl bg-secondary px-8 py-4 text-label-lg font-bold text-on-secondary transition hover:bg-secondary-container hover:text-on-secondary-container"
              >
                Book this route
              </Link>
              <Link
                href={`/${locale}/border-info`}
                className="inline-flex items-center justify-center rounded-xl border border-white/35 px-8 py-4 text-label-lg font-bold text-white transition hover:bg-white/10"
              >
                Border information
              </Link>
            </div>
          </div>

          <aside className="rounded-2xl border border-white/20 bg-white/12 p-6 backdrop-blur-md">
            <p className="text-label-sm uppercase tracking-[0.16em] text-white/70">Route summary</p>
            <dl className="mt-5 space-y-4">
              {[
                ['From', `${route.from}, ${route.fromCountry}`],
                ['To', `${route.to}, ${route.toCountry}`],
                ['Estimated drive', `${route.durationHours} hours`],
                ['From price', basePrice ? formatNGN(basePrice) : 'Ask for quote'],
                ['Border crossing', route.borderCrossings.join(', ')],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-white/15 pb-4 last:border-0 last:pb-0">
                  <dt className="text-label-sm text-white/60">{label}</dt>
                  <dd className="mt-1 text-body-md font-semibold text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1280px] gap-8 px-4 py-16 md:grid-cols-3 md:px-10">
        {[
          {
            icon: 'directions_car',
            title: 'Private vehicle options',
            copy: 'Choose available saloon, SUV, Sienna, Prado/GX460 or bus options depending on passenger count and route availability.',
          },
          {
            icon: 'assignment_ind',
            title: 'Border support',
            copy: 'Beninfy operations helps coordinate document readiness, border handling and customer support across the route.',
          },
          {
            icon: 'support_agent',
            title: 'Operations team',
            copy: 'Customers receive support before departure, during the trip, and after arrival for route changes or urgent needs.',
          },
        ].map((item) => (
          <article key={item.title} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-6">
            <span className="material-symbols-outlined text-primary text-[30px]">{item.icon}</span>
            <h2 className="mt-4 text-headline-sm text-on-surface">{item.title}</h2>
            <p className="mt-3 text-body-md leading-relaxed text-on-surface-variant">{item.copy}</p>
          </article>
        ))}
      </section>

      <section className="border-t border-outline-variant bg-surface-container-low py-14">
        <div className="mx-auto flex max-w-[960px] flex-col items-center px-4 text-center md:px-10">
          <h2 className="text-headline-lg text-primary">Ready to travel from {route.from} to {route.to}?</h2>
          <p className="mt-4 max-w-2xl text-body-lg text-on-surface-variant">
            Start with your travel date, passenger count and preferred vehicle. Beninfy will show available fleet options for this corridor.
          </p>
          <Link
            href={bookHref}
            className="mt-7 inline-flex items-center justify-center rounded-xl bg-primary px-9 py-4 text-label-lg font-bold text-on-primary transition hover:bg-primary-container hover:text-on-primary-container"
          >
            Check availability
          </Link>
        </div>
      </section>
    </main>
  )
}
