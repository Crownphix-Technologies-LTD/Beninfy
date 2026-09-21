import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { getPublicTours, getTourVehicleCategories } from '@/lib/tourCatalog'
import { pageMetadata, seoImages } from '@/lib/seo'
import TourBookingExperience from '@/components/tours/TourBookingExperience'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return pageMetadata({
    title: 'Private Tours in Cotonou, Ouidah and Ganvie',
    description:
      'Book one private Beninfy Tour or combine Cotonou, Ouidah and Ganvie in one itinerary, vehicle and payment.',
    path: 'tours',
    image: seoImages.tours,
    locale,
    keywords: ['Cotonou private tour', 'Ouidah tour', 'Ganvie transport', 'Benin Republic tours'],
  })
}

export default async function ToursPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const [tours, vehicleCategories, session] = await Promise.all([
    getPublicTours(),
    getTourVehicleCategories(),
    auth(),
  ])

  return (
    <TourBookingExperience
      locale={locale}
      tours={tours}
      vehicleCategories={vehicleCategories}
      signedIn={Boolean(session?.user?.id)}
    />
  )
}
