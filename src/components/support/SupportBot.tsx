'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { useSession } from 'next-auth/react'
import { CalendarCheck, CarFront, MessageCircle, Phone, Route, X } from 'lucide-react'
import { siteConfig } from '@/lib/config'
import { cn } from '@/lib/utils'

const WHATSAPP_NUMBER = siteConfig.contact.whatsapp.replace(/[^\d]/g, '')

const copy = {
  en: {
    title: 'Beninfy Support',
    subtitle: 'Need help planning a ride, tour, or border crossing?',
    status: 'Usually replies quickly',
    whatsapp: 'Chat on WhatsApp',
    call: 'Call support',
    ride: 'Book a ride',
    tour: 'Explore tours',
    route: 'Border info',
    prompt: 'Hello Beninfy, I need help with a booking.',
    open: 'Open support chat',
    close: 'Close support chat',
  },
  fr: {
    title: 'Support Beninfy',
    subtitle: 'Besoin d’aide pour un trajet, un tour ou une frontière ?',
    status: 'Réponse généralement rapide',
    whatsapp: 'Discuter sur WhatsApp',
    call: 'Appeler le support',
    ride: 'Réserver un trajet',
    tour: 'Voir les tours',
    route: 'Infos frontières',
    prompt: 'Bonjour Beninfy, j’ai besoin d’aide pour une réservation.',
    open: 'Ouvrir le support',
    close: 'Fermer le support',
  },
} as const

export default function SupportBot() {
  const locale = useLocale() as 'en' | 'fr'
  const { status } = useSession()
  const [open, setOpen] = useState(false)
  const t = copy[locale] ?? copy.en
  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.prompt)}`

  return (
    <div className={cn('fixed right-4 z-[60] md:right-6', status === 'authenticated' ? 'bottom-24 md:bottom-6' : 'bottom-5 md:bottom-6')}>
      {open && (
        <div className="mb-3 w-[min(calc(100vw-2rem),360px)] overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-primary px-4 py-4 text-on-primary">
            <div>
              <div className="flex items-center gap-2 text-label-md font-semibold">
                <MessageCircle className="h-4 w-4" />
                {t.title}
              </div>
              <p className="mt-1 text-body-sm text-on-primary/80">{t.status}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className="rounded-full p-1.5 text-on-primary/80 transition-colors hover:bg-white/10 hover:text-on-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 p-4">
            <p className="text-body-sm text-on-surface-variant">{t.subtitle}</p>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-label-md font-semibold text-white transition-transform active:scale-[0.98]"
            >
              <MessageCircle className="h-5 w-5" />
              {t.whatsapp}
            </a>
            <a
              href={`tel:+${WHATSAPP_NUMBER}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant px-4 py-3 text-label-md text-on-surface transition-colors hover:bg-surface-container"
            >
              <Phone className="h-4 w-4" />
              {t.call}
            </a>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <Link
                href={`/${locale}/rides`}
                onClick={() => setOpen(false)}
                className="flex flex-col items-center gap-1 rounded-xl bg-surface-container px-2 py-3 text-center text-label-sm text-on-surface-variant"
              >
                <CarFront className="h-4 w-4 text-primary" />
                {t.ride}
              </Link>
              <Link
                href={`/${locale}/tours`}
                onClick={() => setOpen(false)}
                className="flex flex-col items-center gap-1 rounded-xl bg-surface-container px-2 py-3 text-center text-label-sm text-on-surface-variant"
              >
                <CalendarCheck className="h-4 w-4 text-primary" />
                {t.tour}
              </Link>
              <Link
                href={`/${locale}/border-info`}
                onClick={() => setOpen(false)}
                className="flex flex-col items-center gap-1 rounded-xl bg-surface-container px-2 py-3 text-center text-label-sm text-on-surface-variant"
              >
                <Route className="h-4 w-4 text-primary" />
                {t.route}
              </Link>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? t.close : t.open}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-black/20 transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-7 w-7" />}
      </button>
    </div>
  )
}
