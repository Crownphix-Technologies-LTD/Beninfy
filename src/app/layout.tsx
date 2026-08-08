import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { siteConfig } from '@/lib/config'
import { absoluteUrl, seoImages } from '@/lib/seo'
import PWAUpdater from '@/components/shared/PWAUpdater'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Beninfy | Private Cross-Border Rides in West Africa',
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    'West Africa transport',
    'Lagos Cotonou',
    'cross-border transport',
    'Nigeria Benin Togo Ghana',
    'airport pickup',
    'VIP transport',
    'Lagos to Cotonou private car',
    'Cotonou to Lome transport',
    'Lome to Accra private ride',
    'Benin Republic transport',
  ],
  applicationName: siteConfig.name,
  referrer: 'origin-when-cross-origin',
  authors: [{ name: 'Beninfy' }],
  publisher: 'Beninfy Logistics',
  creator: 'Beninfy',
  metadataBase: new URL(siteConfig.url),
  alternates: {
    canonical: '/en',
    languages: {
      en: '/en',
      fr: '/fr',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteConfig.url,
    title: 'Beninfy | Private Cross-Border Rides in West Africa',
    description: siteConfig.description,
    siteName: siteConfig.name,
    images: [{ url: absoluteUrl(seoImages.default), width: 1200, height: 630, alt: siteConfig.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Beninfy | Private Cross-Border Rides in West Africa',
    description: siteConfig.description,
    images: [absoluteUrl(seoImages.default)],
    creator: '@beninfy',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteConfig.name,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#3e004c" />
        <meta name="google-site-verification" content="eBSYR23muXIiOSfL8vm_MCM_kgEBF7VtseXK8zeGKhw" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Beninfy" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(){var d=document.documentElement,f="24px 'Material Symbols Outlined'";function ready(){return document.fonts&&document.fonts.check&&document.fonts.check(f)}function reveal(){if(ready())d.classList.add("fonts-loaded")}if(!document.fonts){d.classList.add("fonts-loaded");return}reveal();document.fonts.load(f).then(reveal).catch(function(){});document.fonts.ready.then(reveal).catch(function(){});var n=0,t=setInterval(function(){reveal();if(d.classList.contains("fonts-loaded")||++n>40)clearInterval(t)},100) }();`,
          }}
        />
      </head>
      <body suppressHydrationWarning className={`${inter.variable} font-sans antialiased bg-surface text-on-surface`}>
        <PWAUpdater />
        {children}
      </body>
    </html>
  )
}
