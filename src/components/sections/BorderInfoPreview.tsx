import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { getPublicBorderFees } from '@/lib/borderFeeCatalog'
import { formatNGN } from '@/lib/utils'

export default async function BorderInfoPreview() {
  const locale = await getLocale()
  const t = await getTranslations('border')
  const borderFees = await getPublicBorderFees()
  return (
    <section className="py-20 bg-primary-container">
      <div className="max-w-[1280px] mx-auto px-4 md:px-10">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="text-on-primary-container text-label-md tracking-widest uppercase opacity-70">
            {t('sectionBadge')}
          </span>
          <h2 className="text-headline-lg text-on-primary mt-2">{t('sectionTitle')}</h2>
          <p className="text-on-primary-container/80 mt-2 max-w-2xl mx-auto text-body-md">
            {t('sectionSubtitle')}
          </p>
        </div>

        {/* Border cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {borderFees.map((border) => (
            <div
              key={border.id}
              className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/40 hover:shadow-lg transition-shadow"
            >
              {/* Icon + Country */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-[24px]">
                    {border.icon}
                  </span>
                </div>
                <div>
                  <h3 className="text-headline-sm">{border.country}</h3>
                  <p className="text-label-sm text-on-surface-variant">{border.border}</p>
                </div>
              </div>

              {/* Pricing */}
              <div className="bg-surface-container rounded-xl p-4 mb-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-label-md text-on-surface-variant">{t('oneWay')}</span>
                  <span className="text-headline-sm text-secondary font-bold">
                    {formatNGN(border.feePerPersonNGN)}
                    <span className="text-label-sm text-on-surface-variant font-normal">
                      {' '}
                      {t('perPerson')}
                    </span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-label-md text-on-surface-variant">{t('roundTrip')}</span>
                  <span className="text-headline-sm text-secondary font-bold">
                    {formatNGN(border.feeRoundTripNGN)}
                    <span className="text-label-sm text-on-surface-variant font-normal">
                      {' '}
                      {t('perPerson')}
                    </span>
                  </span>
                </div>
              </div>

              {/* Services */}
              <ul className="space-y-2">
                {border.services.map((s) => (
                  <li key={s} className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary icon-fill text-[16px]">
                      check_circle
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href={`/${locale}/border-info`}
            className="inline-flex items-center gap-2 rounded-xl bg-surface-container-lowest text-primary px-8 py-4 text-label-md hover:shadow-md transition-all"
          >
            {t('viewGuide')}
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
