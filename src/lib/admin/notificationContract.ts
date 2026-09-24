import { z } from 'zod'

export const MAX_NOTIFICATION_RECIPIENTS = 5000
export const notificationAudienceSchema = z.enum([
  'customer',
  'driver',
  'all_customers',
  'all_drivers',
])
export type NotificationAudience = z.infer<typeof notificationAudienceSchema>
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      'Use plain text without HTML or control characters'
    )
const translation = z.object({ title: plainText(100), body: plainText(1000) }).strict()
export const announcementContentSchema = z.object({ en: translation, fr: translation }).strict()
export type AnnouncementContent = z.infer<typeof announcementContentSchema>
export const notificationPreviewSchema = z
  .object({
    requestId: z.string().uuid(),
    audience: notificationAudienceSchema,
    recipientId: z.string().min(1).max(200).optional(),
    content: announcementContentSchema,
  })
  .strict()
  .refine(
    (input) => (input.audience.startsWith('all_') ? !input.recipientId : !!input.recipientId),
    'Select an individual recipient, or use a broadcast audience'
  )
export const notificationConfirmSchema = z
  .object({
    campaignId: z.string().min(1).max(200),
    confirmation: z.string().max(120),
  })
  .strict()
export function confirmationPhrase(audience: string, count: number) {
  return `Send to ${count.toLocaleString('en-US')} ${audience === 'customer' || audience === 'all_customers' ? (count === 1 ? 'Customer' : 'Customers') : count === 1 ? 'Driver' : 'Drivers'}`
}
export type NotificationPreview = {
  id: string
  audience: string
  recipientCount: number
  deviceCount: number
  content: AnnouncementContent
  status: string
  expiresAt: string
  confirmation: string
  recipient: { name: string | null; email: string | null } | null
}
export type NotificationHistoryItem = {
  id: string
  createdAt: string
  queuedAt: string | null
  audience: string
  title: string
  type: string
  recipientCount: number
  status: string
  deliverySummary: Record<string, number>
  noActiveDevice: number
}
export type NotificationDashboard = {
  metrics: {
    notifications: number
    pending: number
    sent: number
    failed: number
    customerDevices: number
    driverDevices: number
  }
  history: NotificationHistoryItem[]
  nextCursor: string | null
}
