import Link from 'next/link'
import { setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return pageMetadata({
    title: 'Terms of Service | Beninfy Rides',
    description: 'Beninfy Rides partner agency transportation policy, payment terms, discounts, and cancellation rules.',
    path: 'terms',
    locale,
  })
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <div className="min-h-screen bg-background">
      <main className="mt-16">
        <section className="border-b border-outline-variant bg-primary py-16 text-on-primary md:py-24">
          <div className="mx-auto max-w-[960px] px-4 md:px-10">
            <p className="mb-3 text-label-md font-bold uppercase tracking-widest text-on-primary/70">
              Beninfy Rides Policy
            </p>
            <h1 className="text-display-md md:text-display-lg">Terms of Service</h1>
            <p className="mt-5 max-w-2xl text-body-lg leading-relaxed text-on-primary/80">
              Partner Agency ride policy for transportation services, payment terms,
              installment rules, discounts, and cancellations.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[960px] px-4 py-12 md:px-10 md:py-16">
          <div className="space-y-5">
            <PolicySection title="1. Scope of Service">
              <p>
                Beninfy Rides agrees to provide reliable transportation services for the Partner
                Agency&apos;s travel packages, including one-way trips, return trips, and
                tour-related movements as agreed per booking.
              </p>
            </PolicySection>

            <PolicySection title="2. Payment Terms">
              <ul className="space-y-3">
                <li>
                  <strong className="text-on-surface">One-Way Trips:</strong> Full payment is
                  required prior to trip confirmation and execution.
                </li>
                <li>
                  <strong className="text-on-surface">Return Trips:</strong>
                  <ul className="mt-3 space-y-2 border-l-2 border-primary/20 pl-4">
                    <li>A minimum deposit of 70% is required to confirm booking.</li>
                    <li>
                      The remaining 30% balance must be paid immediately upon arrival at the
                      destination.
                    </li>
                  </ul>
                </li>
              </ul>
            </PolicySection>

            <PolicySection title="3. Installment Policy">
              <ul className="space-y-3">
                <li>The 70% installment option applies strictly to return trips only.</li>
                <li>All one-way trips must be paid in full before departure.</li>
              </ul>
            </PolicySection>

            <PolicySection title="4. Discount Benefit">
              <ul className="space-y-3">
                <li>The Partner Agency will receive a &#8358;10,000 discount on every ride.</li>
                <li>This discount will take effect from the second booking onward.</li>
                <li>
                  The first booking serves as a standard onboarding trip and is not eligible for
                  the discount.
                </li>
              </ul>
            </PolicySection>

            <PolicySection title="5. Cancellation Policy">
              <ul className="space-y-3">
                <li>
                  Any cancellation made less than 24 hours prior to the scheduled trip will
                  attract a cancellation fee equivalent to the full cost of a one-way trip.
                </li>
                <li>
                  This is to cover operational and logistical commitments already made.
                </li>
              </ul>
            </PolicySection>

            <PolicySection title="6. Refund Policy">
              <ul className="space-y-3">
                <li>
                  Refund requests are reviewed by Beninfy support based on payment status,
                  cancellation timing, and operational commitments already made for the trip.
                </li>
                <li>
                  Where a cancellation fee, payment provider charge, or committed logistics cost
                  applies, the refundable amount may be reduced accordingly.
                </li>
              </ul>
            </PolicySection>
          </div>

          <div className="mt-10 rounded-2xl border border-outline-variant bg-surface-container-low p-5 text-body-md text-on-surface-variant md:p-6">
            <p>
              Need clarification before confirming a booking? Contact Beninfy support so the
              trip terms are clear before payment.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/${locale}/rides/book`}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 text-label-lg text-on-primary transition-opacity hover:opacity-90"
              >
                Book a Ride
              </Link>
              <a
                href="https://wa.me/22951019134"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-outline bg-surface px-5 py-3 text-label-lg text-on-surface transition-colors hover:text-primary"
              >
                Contact Support
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function PolicySection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <article className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm md:p-7">
      <h2 className="mb-4 text-headline-sm text-on-surface">{title}</h2>
      <div className="text-body-md leading-relaxed text-on-surface-variant">{children}</div>
    </article>
  )
}
