import { requireAdminPermission } from '@/lib/admin'
import TourFeedbackConsole from '@/components/admin/TourFeedbackConsole'

export default async function TourFeedbackPage() {
  const guard = await requireAdminPermission('tour_feedback')
  if (!guard.ok)
    return (
      <p role="alert" className="text-sm text-red-700">
        Access denied.
      </p>
    )
  return <TourFeedbackConsole />
}
