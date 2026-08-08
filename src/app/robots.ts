import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/config'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/en/admin/',
        '/fr/admin/',
        '/en/admin-login',
        '/fr/admin-login',
        '/en/admin-signup',
        '/fr/admin-signup',
        '/en/dashboard',
        '/fr/dashboard',
        '/en/profile',
        '/fr/profile',
        '/en/login',
        '/fr/login',
        '/en/register',
        '/fr/register',
        '/en/rides/book',
        '/fr/rides/book',
        '/en/rides/pay',
        '/fr/rides/pay',
        '/en/rides/confirmed',
        '/fr/rides/confirmed',
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  }
}
