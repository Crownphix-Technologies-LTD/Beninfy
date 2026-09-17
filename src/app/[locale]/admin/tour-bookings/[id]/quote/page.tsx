import { notFound } from 'next/navigation'
import { requireAdminPermission } from '@/lib/admin'
import { findTourBookingQuote } from '@/lib/admin/tourCommercial'
import TourItineraryEditor from '@/components/admin/TourItineraryEditor'

export default async function TourQuotePage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return <p role="alert">You do not have permission to quote Tours.</p>
  const { id, locale } = await params
  const result = await findTourBookingQuote(id)
  if (!result || result.booking.itineraryMode !== 'custom') notFound()
  return (
    <TourItineraryEditor
      locale={locale}
      initial={result.response}
      tour={{
        id,
        title: result.booking.reference,
        durationDays: result.booking.days.length,
        startingFromNGN: result.booking.priceNGN,
      }}
      operationsQuote={{
        request: result.booking.customItinerary ?? '',
        pending: result.booking.quoteStatus === 'pending',
      }}
    />
  )
}
