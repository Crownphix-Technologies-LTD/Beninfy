import { notFound } from 'next/navigation'
import { requireAdminPermission } from '@/lib/admin'
import { adminTourItineraryResponse, findAdminTourItinerary } from '@/lib/admin/tourItinerary'
import TourItineraryEditor from '@/components/admin/TourItineraryEditor'

export default async function AdminTourItineraryPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const guard = await requireAdminPermission('tours')
  if (!guard.ok) return <p role="alert">You do not have permission to manage Tour itineraries.</p>
  const { locale, id } = await params
  const tour = await findAdminTourItinerary(id)
  if (!tour) notFound()
  return (
    <TourItineraryEditor
      locale={locale}
      tour={{
        id: tour.id,
        title: tour.title,
        durationDays: tour.durationDays,
        startingFromNGN: tour.startingFromNGN,
      }}
      initial={adminTourItineraryResponse(tour)}
    />
  )
}
