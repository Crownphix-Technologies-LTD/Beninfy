'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'

const RESTRICTED = new Set(['/rides', '/tours', '/fleet', '/border-info'])

export default function Footer() {
  const locale = useLocale()
  const t = useTranslations('footer')
  const { status } = useSession()
  const signedIn = status === 'authenticated'

  const linkClass = (href: string, base = 'hover:text-primary transition-colors') => base

  const itemClass = (href: string) =>
    RESTRICTED.has(href) && !signedIn ? 'hidden sm:list-item' : ''

  return (
    <footer className="border-t border-outline-variant bg-surface-dim pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8 md:py-16">
      <div className="mx-auto max-w-[1280px] px-4 md:px-10 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4 md:gap-6">
        {/* Brand */}
        <div className="rounded-2xl bg-surface-container-lowest/70 p-5 sm:col-span-2 md:col-span-1 md:bg-transparent md:p-0">
          <Link href={`/${locale}`} className="mb-4 inline-flex">
            <Image
              src="/logo.png"
              alt="Beninfy"
              width={180}
              height={78}
              className="h-16 w-auto object-contain"
            />
          </Link>
          <p className="max-w-sm text-body-sm text-on-surface-variant md:pr-8 leading-relaxed">
            {t('tagline')}
          </p>
          <div className="flex gap-3 mt-5">
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-[20px]">photo_camera</span>
            </a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-[20px]">language</span>
            </a>
            <a href="mailto:support@beninfy.com" aria-label="Email" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition-colors hover:text-primary">
              <span className="material-symbols-outlined text-[20px]">alternate_email</span>
            </a>
          </div>
        </div>

        {/* Services */}
        <div className={cn(!signedIn && 'hidden sm:block')}>
          <h4 className="text-label-sm font-bold mb-3 uppercase tracking-wider text-on-surface">
            {t('services')}
          </h4>
          <ul className="flex flex-col divide-y divide-outline-variant/40 text-label-md text-on-surface-variant sm:gap-3 sm:divide-y-0">
            {[
              { labelKey: 'privateRides', href: '/rides' },
              { labelKey: 'vipEscorts', href: '/rides' },
              { labelKey: 'groupTours', href: '/tours' },
              { labelKey: 'corporateLogistics', href: '/fleet' },
            ].map(({ labelKey, href }) => (
              <li key={labelKey} className={itemClass(href)}>
                <Link href={`/${locale}${href}`} className={cn('block py-3 sm:py-0', linkClass(href))}>
                  {t(labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Resources */}
        <div>
          <h4 className="text-label-sm font-bold mb-3 uppercase tracking-wider text-on-surface">
            {t('resources')}
          </h4>
          <ul className="flex flex-col divide-y divide-outline-variant/40 text-label-md text-on-surface-variant sm:gap-3 sm:divide-y-0">
            <li className={itemClass('/border-info')}>
              <Link href={`/${locale}/border-info`} className={cn('block py-3 sm:py-0', linkClass('/border-info', 'font-bold text-secondary hover:underline'))}>
                {t('borderProtocols')}
              </Link>
            </li>
            {[
              { labelKey: 'fleetInfo', href: '/fleet' },
              { labelKey: 'toursPackages', href: '/tours' },
              { labelKey: 'safetyFaq', href: '/about' },
            ].map(({ labelKey, href }) => (
              <li key={labelKey} className={itemClass(href)}>
                <Link href={`/${locale}${href}`} className={cn('block py-3 sm:py-0', linkClass(href))}>
                  {t(labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Company */}
        <div>
          <h4 className="text-label-sm font-bold mb-3 uppercase tracking-wider text-on-surface">
            {t('company')}
          </h4>
          <ul className="flex flex-col divide-y divide-outline-variant/40 text-label-md text-on-surface-variant sm:gap-3 sm:divide-y-0">
            {[
              { labelKey: 'aboutUs', href: '/about' },
              { labelKey: 'contactSupport', href: '/about#contact' },
              { labelKey: 'privacyPolicy', href: '/privacy' },
              { labelKey: 'termsOfService', href: '/terms' },
            ].map(({ labelKey, href }) => (
              <li key={labelKey}>
                <Link href={`/${locale}${href}`} className="block py-3 hover:text-primary transition-colors sm:py-0">
                  {t(labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mx-auto max-w-[1280px] px-4 md:px-10 mt-8 md:mt-16 pt-5 md:pt-8 border-t border-outline-variant/40 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 text-body-sm text-on-surface-variant text-left">
        <p className="text-center md:text-left">© {new Date().getFullYear()} Beninfy Logistics.</p>
        <div className="grid grid-cols-1 gap-2 text-label-sm sm:grid-cols-2 md:flex md:gap-6">
          <a href="tel:+2348002364639" className="rounded-xl bg-surface-container px-4 py-3 text-center transition-colors hover:text-primary md:bg-transparent md:p-0">
            Lagos: +234 800 BENINFY
          </a>
          <a href="tel:+22997000000" className="rounded-xl bg-surface-container px-4 py-3 text-center transition-colors hover:text-primary md:bg-transparent md:p-0">
            Cotonou: +229 97 000 000
          </a>
        </div>
      </div>
    </footer>
  )
}
