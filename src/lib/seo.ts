import type { Metadata } from 'next'
import { siteConfig } from '@/lib/config'

export type Locale = 'en' | 'fr'

const locales: Locale[] = ['en', 'fr']

export const seoImages = {
  default: '/hero-bg.jpg',
  routes: '/images/routes/lagos-cotonou.jpg',
  fleet: '/hero-bg2.jpg',
  tours: '/images/cta/togo-metallic-flag-textured-flag-grunge-flag.jpg',
}

export function absoluteUrl(path = '') {
  return `${siteConfig.url}${path.startsWith('/') ? path : `/${path}`}`
}

export function localizedPath(locale: string, path = '') {
  const normalized = path && path !== '/' ? `/${path.replace(/^\/+/, '')}` : ''
  return `/${locale}${normalized}`
}

export function localizedAlternates(path = '') {
  return {
    canonical: localizedPath('en', path),
    languages: Object.fromEntries(locales.map((locale) => [locale, localizedPath(locale, path)])),
  }
}

export function pageMetadata({
  title,
  description,
  path = '',
  image = seoImages.default,
  noIndex = false,
  keywords = [],
  locale = 'en',
}: {
  title: string
  description: string
  path?: string
  image?: string
  noIndex?: boolean
  keywords?: string[]
  locale?: string
}): Metadata {
  const url = absoluteUrl(localizedPath(locale, path))
  return {
    title,
    description,
    keywords,
    alternates: {
      ...localizedAlternates(path),
      canonical: localizedPath(locale, path),
    },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url,
      title,
      description,
      siteName: siteConfig.name,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    '@id': `${siteConfig.url}/#organization`,
    name: 'Beninfy',
    legalName: 'Beninfy Logistics',
    url: siteConfig.url,
    logo: absoluteUrl('/logo.png'),
    description: siteConfig.description,
    areaServed: ['Nigeria', 'Benin Republic', 'Togo', 'Ghana'],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@beninfy.com',
        telephone: '+22951019134',
        availableLanguage: ['English', 'French'],
      },
    ],
    sameAs: [siteConfig.links.instagram, siteConfig.links.facebook, siteConfig.links.twitter],
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteConfig.url}/#website`,
    url: siteConfig.url,
    name: 'Beninfy',
    publisher: { '@id': `${siteConfig.url}/#organization` },
    inLanguage: ['en', 'fr'],
  }
}

export function routeServiceJsonLd(route: {
  id: string
  from: string
  fromCountry?: string | null
  to: string
  toCountry?: string | null
  durationHours: number
  description?: string | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${siteConfig.url}/en/routes/${route.id}#service`,
    name: `${route.from} to ${route.to} private transport`,
    description:
      route.description ??
      `Private cross-border transport from ${route.from} to ${route.to} with Beninfy Rides.`,
    provider: { '@id': `${siteConfig.url}/#organization` },
    areaServed: [route.fromCountry, route.toCountry].filter(Boolean),
    serviceType: 'Private cross-border transport',
    offers: {
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
      url: `${siteConfig.url}/en/routes/${route.id}`,
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Beninfy vehicle classes',
      itemListElement: ['Saloon', 'SUV', 'Sienna', 'Prado', 'Sprinter'].map((name) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name },
      })),
    },
  }
}

export function routeSeoImage(routeId: string, image?: string | null) {
  if (routeId === 'cotonou-togo' || routeId === 'lome-cotonou') return '/images/routes/cotonou-lome.jpg'
  if (routeId === 'togo-ghana' || routeId === 'accra-lome' || routeId === 'accra-cotonou' || routeId === 'cotonou-accra') {
    return '/images/routes/lome-accra.jpg'
  }
  if (image === '/images/routes/lagos-lome.jpg' || image === '/images/routes/lagos-accra.jpg') {
    return '/images/routes/cotonou-lome.jpg'
  }
  return image || seoImages.routes
}
