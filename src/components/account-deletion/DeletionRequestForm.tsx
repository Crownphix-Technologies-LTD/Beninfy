'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { accountDeletionCopy } from '@/lib/accountDeletionCopy'

export default function DeletionRequestForm({ locale }: { locale: 'en' | 'fr' }) {
  const copy = accountDeletionCopy[locale]
  const [requestId, setRequestId] = useState<string | null>(null)
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const alert = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (requestId || scheduledAt) heading.current?.focus()
  }, [requestId, scheduledAt])
  useEffect(() => {
    if (error) alert.current?.focus()
  }, [error])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const body = requestId
        ? {
            requestId,
            code: String(data.get('code') ?? '').trim(),
            confirmation: data.get('consent') === 'yes' ? 'DELETE_MY_ACCOUNT' : '',
          }
        : {
            email: String(data.get('email') ?? '').trim(),
            locale,
            website: String(data.get('website') ?? ''),
          }
      const response = await fetch(`/api/account-deletion/${requestId ? 'confirm' : 'request'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(20000),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(
          result.code === 'INVALID_CODE'
            ? copy.invalid
            : result.code === 'RATE_LIMITED'
              ? copy.limited
              : copy.unavailable
        )
      } else if (requestId && typeof result.deletion?.scheduledAt === 'string') {
        setScheduledAt(result.deletion.scheduledAt)
      } else if (!requestId && typeof result.requestId === 'string') {
        setRequestId(result.requestId)
      } else setError(copy.unavailable)
    } catch {
      setError(copy.unavailable)
    } finally {
      setBusy(false)
    }
  }

  const field =
    'mt-2 min-h-12 w-full rounded-xl border border-outline bg-surface px-4 py-3 text-base text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
  return (
    <section
      aria-labelledby="deletion-form-title"
      className="border-outline-variant bg-surface-container-lowest rounded-2xl border p-5 shadow-sm sm:p-8"
    >
      <h2
        id="deletion-form-title"
        ref={heading}
        tabIndex={-1}
        className="text-headline-sm text-on-surface"
      >
        {scheduledAt ? copy.successTitle : requestId ? copy.codeTitle : copy.formTitle}
      </h2>
      <noscript>
        <p className="mt-4">{copy.noJavascript}</p>
      </noscript>
      {scheduledAt ? (
        <div role="status" className="text-body-md mt-5 space-y-4 leading-relaxed">
          <p>{copy.success}</p>
          <p>
            {copy.scheduled}{' '}
            <strong>
              {new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
                new Date(scheduledAt)
              )}{' '}
              (UTC)
            </strong>
            .
          </p>
          <p>{copy.completion}</p>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={busy} className="mt-5 space-y-5">
          {requestId ? (
            <>
              <p role="status" className="text-body-md leading-relaxed">
                {copy.sent}
              </p>
              <div>
                <label htmlFor="deletion-code" className="font-semibold">
                  {copy.code}
                </label>
                <input
                  id="deletion-code"
                  name="code"
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{8}"
                  minLength={8}
                  maxLength={8}
                  aria-describedby="deletion-code-help"
                  className={field}
                  disabled={busy}
                />
                <p id="deletion-code-help" className="text-on-surface-variant mt-2 text-sm">
                  {copy.codeHelp}
                </p>
              </div>
              <label className="border-outline-variant flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-4 leading-relaxed">
                <input
                  name="consent"
                  type="checkbox"
                  value="yes"
                  required
                  disabled={busy}
                  className="accent-primary mt-1 h-5 w-5 shrink-0"
                />
                <span>{copy.consent}</span>
              </label>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="deletion-email" className="font-semibold">
                  {copy.email}
                </label>
                <input
                  id="deletion-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  required
                  aria-describedby="deletion-email-help"
                  className={field}
                  disabled={busy}
                />
                <p id="deletion-email-help" className="text-on-surface-variant mt-2 text-sm">
                  {copy.emailHelp}
                </p>
              </div>
              <div hidden aria-hidden="true">
                <label htmlFor="deletion-website">Website</label>
                <input id="deletion-website" name="website" tabIndex={-1} autoComplete="off" />
              </div>
            </>
          )}
          {error && (
            <p
              ref={alert}
              tabIndex={-1}
              role="alert"
              className="border-error text-error rounded-xl border p-4"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-on-primary focus-visible:outline-primary min-h-12 w-full rounded-xl px-5 py-3 font-semibold hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60"
          >
            {requestId ? (busy ? copy.confirming : copy.confirm) : busy ? copy.sending : copy.send}
          </button>
          {requestId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRequestId(null)
                setError('')
              }}
              className="border-outline text-primary focus-visible:outline-primary min-h-12 w-full rounded-xl border px-4 py-3 underline underline-offset-4 focus-visible:outline-2"
            >
              {copy.restart}
            </button>
          )}
        </form>
      )}
    </section>
  )
}
