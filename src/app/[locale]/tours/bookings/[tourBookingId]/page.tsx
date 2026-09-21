import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import TourBookingCheckout from '@/components/tours/TourBookingCheckout'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Tour booking | Beninfy',
  robots: { index: false, follow: false },
}

export default async function TourBookingPage({
  params,
}: {
  params: Promise<{ locale: string; tourBookingId: string }>
}) {
  const { locale, tourBookingId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    redirect(
      `/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/tours/bookings/${tourBookingId}`)}`
    )
  }
  return <TourBookingCheckout bookingId={tourBookingId} locale={locale} />
}
