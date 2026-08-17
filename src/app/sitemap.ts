import type { MetadataRoute } from 'next'
import { getPublicRoutes } from '@/lib/routeCatalog'
import { absoluteUrl, localizedPath, routeSeoImage } from '@/lib/seo'

const locales = ['en', 'fr'] as const
const publicPages = [
  { path: '', priority: 1, changeFrequency: 'weekly' as const },
  { path: 'rides', priority: 0.95, changeFrequency: 'daily' as const },
  { path: 'fleet', priority: 0.85, changeFrequency: 'weekly' as const },
  { path: 'tours', priority: 0.82, changeFrequency: 'weekly' as const },
  { path: 'border-info', priority: 0.78, changeFrequency: 'monthly' as const },
  { path: 'about', priority: 0.72, changeFrequency: 'monthly' as const },
  { path: 'terms', priority: 0.42, changeFrequency: 'yearly' as const },
  { path: 'privacy', priority: 0.42, changeFrequency: 'yearly' as const },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()
  const routes = await getPublicRoutes()

  const pages = locales.flatMap((locale) =>
    publicPages.map((page) => ({
      url: absoluteUrl(localizedPath(locale, page.path)),
      lastModified,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    }))
  )

  const routePages = locales.flatMap((locale) =>
    routes.map((route) => ({
      url: absoluteUrl(localizedPath(locale, `routes/${route.id}`)),
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: route.popular ? 0.88 : 0.76,
      images: [absoluteUrl(routeSeoImage(route.id, route.image))],
    }))
  )

  return [...pages, ...routePages]
}
