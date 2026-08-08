import HeroSection from '@/components/sections/HeroSection'
import BookingWidget from '@/components/booking/BookingWidget'
import PopularRoutes from '@/components/sections/PopularRoutes'
import WhyBeninfy from '@/components/sections/WhyBeninfy'
import JourneyIntelligence from '@/components/sections/JourneyIntelligence'
import FleetPreview from '@/components/sections/FleetPreview'
import ToursPreview from '@/components/sections/ToursPreview'
import BorderInfoPreview from '@/components/sections/BorderInfoPreview'
import CTABanner from '@/components/sections/CTABanner'
import { setRequestLocale } from 'next-intl/server'
import { pageMetadata, seoImages } from '@/lib/seo'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return pageMetadata({
    title: 'Private Cross-Border Rides Across Nigeria, Benin, Togo and Ghana',
    description:
      'Book private Lagos to Cotonou, Cotonou to Lomé, Lomé to Accra and West Africa border-assisted rides with premium vehicles and Beninfy operations support.',
    path: '',
    image: seoImages.default,
    locale,
    keywords: [
      'Lagos to Cotonou private car',
      'West Africa cross-border transport',
      'Beninfy Rides',
      'private transport Nigeria Benin Togo Ghana',
    ],
  })
}

export const dynamic = 'force-dynamic'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  return (
    <>
      <HeroSection />
      <BookingWidget />
      <PopularRoutes />
      <JourneyIntelligence />
      <WhyBeninfy />
      <FleetPreview />
      <ToursPreview />
      <BorderInfoPreview />
      <CTABanner />
    </>
  )
}
