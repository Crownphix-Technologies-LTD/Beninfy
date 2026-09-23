import { requireAdminPermission } from '@/lib/admin'
import NotificationConsole from '@/components/admin/NotificationConsole'
export default async function NotificationsPage() {
  const guard = await requireAdminPermission('users')
  if (!guard.ok)
    return (
      <p role="alert" className="text-sm text-red-700">
        Access denied.
      </p>
    )
  return <NotificationConsole />
}
