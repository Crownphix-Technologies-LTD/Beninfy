import { accountDeletionCopy } from '@/lib/accountDeletionCopy'

export default function DeletionPolicy({
  locale,
  graceDays,
}: {
  locale: 'en' | 'fr'
  graceDays: number
}) {
  const copy = accountDeletionCopy[locale]
  return (
    <div className="text-body-md space-y-8 leading-relaxed" lang={locale}>
      <section aria-labelledby="deletion-timing-title">
        <h2 id="deletion-timing-title" className="text-headline-sm mb-3">
          {copy.timingTitle}
        </h2>
        <p>{copy.timing.replace('{days}', String(graceDays))}</p>
        <p className="mt-3">{copy.booking}</p>
      </section>
      <section aria-labelledby="deletion-removed-title">
        <h2 id="deletion-removed-title" className="text-headline-sm mb-3">
          {copy.deletedTitle}
        </h2>
        <ul className="list-disc space-y-3 pl-5">
          {copy.deleted.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="deletion-retained-title">
        <h2 id="deletion-retained-title" className="text-headline-sm mb-3">
          {copy.retainedTitle}
        </h2>
        <ul className="list-disc space-y-3 pl-5">
          {copy.retained.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-4 font-medium">{copy.retention}</p>
        <p className="mt-3">{copy.backups}</p>
      </section>
    </div>
  )
}
