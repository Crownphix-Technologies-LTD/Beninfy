import Link from 'next/link'
import { setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return pageMetadata({
    title: 'Privacy Policy | Beninfy Rides',
    description:
      'How Beninfy Rides collects, uses, stores, and protects customer information for ride bookings and support.',
    path: 'privacy',
    locale,
  })
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <div className="min-h-screen bg-background">
      <main className="mt-16">
        <section className="border-b border-outline-variant bg-primary py-16 text-on-primary md:py-24">
          <div className="mx-auto max-w-[960px] px-4 md:px-10">
            <p className="mb-3 text-label-md font-bold uppercase tracking-widest text-on-primary/70">
              Beninfy Rides Privacy
            </p>
            <h1 className="text-display-md md:text-display-lg">Privacy Policy</h1>
            <p className="mt-5 max-w-2xl text-body-lg leading-relaxed text-on-primary/80">
              This policy explains how Beninfy Rides handles customer information used for
              bookings, payments, border travel coordination, customer support, and account access.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[960px] px-4 py-12 md:px-10 md:py-16">
          <div className="space-y-5">
            <PolicySection title="1. Information We Collect">
              <ul className="space-y-3">
                <li>Account details such as name, email address, and phone number.</li>
                <li>Booking details such as pickup, destination, travel date, passenger count, and ride preferences.</li>
                <li>Travel support details such as nationality, passport or identification references, and special requirements when needed for cross-border coordination.</li>
                <li>Payment status and transaction references from our payment providers.</li>
                <li>Technical information such as browser, device, and basic usage information needed to keep the service secure and reliable.</li>
              </ul>
            </PolicySection>

            <PolicySection title="2. How We Use Information">
              <ul className="space-y-3">
                <li>To create and manage ride bookings, return trips, tours, and fleet assignments.</li>
                <li>To contact customers about trip confirmation, payment, driver coordination, border support, and service updates.</li>
                <li>To provide customer support through email, phone, WhatsApp, and the website.</li>
                <li>To prevent fraud, protect user accounts, and maintain operational records.</li>
                <li>To improve the website, booking flow, and transport operations.</li>
              </ul>
            </PolicySection>

            <PolicySection title="3. Payments">
              <p>
                Beninfy Rides does not store full card details. Payments are processed by our
                authorized payment providers. We store payment references, status, amount, and
                related booking information so we can confirm trips, reconcile payments, and
                support customers when needed.
              </p>
            </PolicySection>

            <PolicySection title="4. Sharing Information">
              <p>
                We only share information when required to deliver the service. This may include
                drivers, operations staff, border handling partners, payment providers, technology
                vendors, and legal or regulatory authorities when required by law.
              </p>
            </PolicySection>

            <PolicySection title="5. Data Security">
              <p>
                We use reasonable technical and organizational measures to protect customer data.
                No online system is completely risk-free, but we limit access to operational data
                and use secure service providers for authentication, database hosting, payments,
                and file storage.
              </p>
            </PolicySection>

            <PolicySection title="6. Data Retention">
              <p>
                We keep booking, payment, and support records for as long as needed to provide the
                service, meet accounting and legal obligations, resolve disputes, and improve
                transport operations.
              </p>
            </PolicySection>

            <PolicySection title="7. Your Choices">
              <p>
                Customers may contact Beninfy support to request account updates, correction of
                inaccurate information, or assistance with privacy questions. Some booking and
                payment records may need to be retained for legal, accounting, or operational
                reasons.
              </p>
            </PolicySection>

            <PolicySection title="8. Contact">
              <p>
                For privacy questions or support requests, contact Beninfy Rides through our
                support channel.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <a
                  href="https://wa.me/22951019134"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 text-label-lg text-on-primary transition-opacity hover:opacity-90"
                >
                  Contact Support
                </a>
                <Link
                  href={`/${locale}/terms`}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-outline bg-surface px-5 py-3 text-label-lg text-on-surface transition-colors hover:text-primary"
                >
                  Terms of Service
                </Link>
              </div>
            </PolicySection>
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
