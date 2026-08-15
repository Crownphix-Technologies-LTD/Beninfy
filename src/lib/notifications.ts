import { isEmailConfigured, sendEmail } from '@/lib/email'
import {
  notifyAssignmentPush,
  notifyPaymentConfirmedPush,
  notifyPaymentFailedPush,
} from '@/lib/mobile/notifications'
import { prisma } from '@/lib/prisma'
import { siteConfig } from '@/lib/config'

const DEFAULT_ADMIN_EMAILS = ['info@beninfy.com', 'operations@beninfy.com']
const SUPPORT_EMAIL = 'support@beninfy.com'
const SUPPORT_WHATSAPP_DISPLAY = '+229 51 01 91 34'
const SUPPORT_WHATSAPP_URL = 'https://wa.me/22951019134'
const BRAND_PURPLE = '#3e004c'
const BRAND_PURPLE_SOFT = '#5b136b'
const BRAND_GOLD = '#d4af37'
const INK = '#24112b'
const MUTED = '#6f6277'
const BORDER = '#eaddec'
const SURFACE = '#fbf7fc'

type EmailTarget = string | Array<string>

type BookingEmailData = Awaited<ReturnType<typeof getBookingEmailData>>
type EmailShellOptions = {
  eyebrow?: string
  ctaLabel?: string
  ctaHref?: string
}

function adminEmails() {
  const configured = process.env.ADMIN_NOTIFICATION_EMAILS?.split(',')
    .map((email) => email.trim())
    .filter(Boolean)

  return configured?.length ? configured : DEFAULT_ADMIN_EMAILS
}

function money(amount: number | null | undefined) {
  return `NGN ${(amount ?? 0).toLocaleString()}`
}

function formatDate(date: Date | null | undefined) {
  if (!date) return 'Not set'
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeZone: 'Africa/Lagos',
  }).format(date)
}

function clean(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not provided'
  return String(value)
}

function escapeHtml(value: unknown) {
  return clean(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function siteUrl(path = '') {
  return `${siteConfig.url}${path}`
}

function rows(items: Array<[string, unknown]>) {
  return items
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:13px 0;border-bottom:1px solid #f0e7f2;color:${MUTED};font-size:13px;line-height:18px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:13px 0;border-bottom:1px solid #f0e7f2;color:${INK};font-size:13px;font-weight:700;line-height:18px;text-align:right;vertical-align:top;">${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join('')
}

function detailsCard(items: Array<[string, unknown]>) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;">
      <tr>
        <td style="padding:8px 18px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${rows(items)}
          </table>
        </td>
      </tr>
    </table>
  `
}

function statusPill(label: string) {
  return `
    <span style="display:inline-block;padding:7px 11px;border-radius:999px;background:#fff8dd;color:#6b5000;border:1px solid #f1dda1;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
      ${escapeHtml(label)}
    </span>
  `
}

function ctaButton(label: string, href: string) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
      <tr>
        <td style="border-radius:999px;background:${BRAND_GOLD};">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 20px;color:${INK};font-size:13px;font-weight:800;text-decoration:none;border-radius:999px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `
}

function emailShell(title: string, intro: string, body: string, options: EmailShellOptions = {}) {
  const eyebrow = options.eyebrow ?? 'Beninfy Logistics'
  const logoUrl = siteUrl('/logo.png')
  const preview = `${title} - ${intro}`.slice(0, 150)

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#f6f1f7;">
      <tr>
        <td align="center" style="padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:${INK};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="padding:0 0 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      <img src="${escapeHtml(logoUrl)}" width="96" alt="Beninfy" style="display:block;width:96px;height:auto;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td align="right" style="vertical-align:middle;color:${MUTED};font-size:12px;line-height:18px;">
                      Premium West African Transport<br>
                      <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_PURPLE_SOFT};font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:20px;overflow:hidden;box-shadow:0 18px 42px rgba(62,0,76,.08);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:28px 28px 30px;background:${BRAND_PURPLE};color:#ffffff;">
                      ${statusPill(eyebrow)}
                      <h1 style="margin:18px 0 0;color:#ffffff;font-size:27px;line-height:34px;font-weight:800;letter-spacing:0;">${escapeHtml(title)}</h1>
                      <p style="margin:12px 0 0;color:#eaddec;font-size:15px;line-height:23px;max-width:560px;">${escapeHtml(intro)}</p>
                      ${options.ctaLabel && options.ctaHref ? ctaButton(options.ctaLabel, options.ctaHref) : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:26px 28px 8px;background:${SURFACE};">
                      ${body}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 26px;background:${SURFACE};">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#ffffff;border:1px solid ${BORDER};border-radius:14px;">
                        <tr>
                          <td style="padding:18px 18px 16px;">
                            <p style="margin:0;color:${INK};font-size:14px;font-weight:800;line-height:20px;">Beninfy Support</p>
                            <p style="margin:6px 0 0;color:${MUTED};font-size:13px;line-height:20px;">
                              For route changes, border coordination, refunds, or urgent travel support, contact
                              <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND_PURPLE_SOFT};font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>
                              or WhatsApp
                              <a href="${SUPPORT_WHATSAPP_URL}" style="color:${BRAND_PURPLE_SOFT};font-weight:700;text-decoration:none;">${SUPPORT_WHATSAPP_DISPLAY}</a>.
                            </p>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:18px 0 0;color:#8a7d91;font-size:11px;line-height:17px;">
                        This is a transactional email for Beninfy Rides. One-way trips require full payment before confirmation. Return trips may require a minimum deposit before dispatch, based on the agreed booking policy.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 20px 0;color:#8a7d91;font-size:11px;line-height:18px;">
                Beninfy Logistics &bull; Nigeria, Benin Republic, Togo and Ghana<br>
                <a href="${siteUrl('/en/terms')}" style="color:${BRAND_PURPLE_SOFT};text-decoration:none;">Terms</a>
                &nbsp;&bull;&nbsp;
                <a href="${siteUrl('/en/privacy')}" style="color:${BRAND_PURPLE_SOFT};text-decoration:none;">Privacy</a>
                &nbsp;&bull;&nbsp;
                <a href="${SUPPORT_WHATSAPP_URL}" style="color:${BRAND_PURPLE_SOFT};text-decoration:none;">WhatsApp support</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `
}

function noticeCard(title: string, copy: string) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#fffdf5;border:1px solid #f0dfa3;border-radius:14px;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0;color:${INK};font-size:13px;font-weight:800;line-height:18px;">${escapeHtml(title)}</p>
          <p style="margin:6px 0 0;color:#6c5b20;font-size:12px;line-height:19px;">${escapeHtml(copy)}</p>
        </td>
      </tr>
    </table>
  `
}

function detailBody(items: Array<[string, unknown]>, notice?: { title: string; copy: string }) {
  return `
    ${detailsCard(items)}
    ${notice ? noticeCard(notice.title, notice.copy) : ''}
  `
}

function adminEmailShell(title: string, intro: string, items: Array<[string, unknown]>) {
  return emailShell(title, intro, detailBody(items), {
    eyebrow: 'Operations Notice',
    ctaLabel: 'Open backoffice',
    ctaHref: siteUrl('/en/admin'),
  })
}

function customerEmailShell(
  title: string,
  intro: string,
  items: Array<[string, unknown]>,
  notice?: { title: string; copy: string }
) {
  return emailShell(title, intro, detailBody(items, notice), {
    eyebrow: 'Customer Update',
    ctaLabel: 'Open dashboard',
    ctaHref: siteUrl('/en/dashboard'),
  })
}

function accountEmailShell(title: string, intro: string, items: Array<[string, unknown]>) {
  return emailShell(title, intro, detailBody(items), {
    eyebrow: 'Account Security',
    ctaLabel: 'Sign in',
    ctaHref: siteUrl('/en/login'),
  })
}

function systemEmailShell(title: string, intro: string, items: Array<[string, unknown]>) {
  return emailShell(title, intro, detailBody(items), {
    eyebrow: 'System Alert',
    ctaLabel: 'Open backoffice',
    ctaHref: siteUrl('/en/admin'),
  })
}

function textFromPairs(title: string, intro: string, items: Array<[string, unknown]>) {
  return [
    title,
    '',
    intro,
    '',
    ...items.map(([label, value]) => `${label}: ${clean(value)}`),
    '',
    'Need help? Contact Beninfy support at support@beninfy.com or WhatsApp +229 51 01 91 34.',
  ].join('\n')
}

async function safeSendEmail(options: {
  to: EmailTarget
  subject: string
  html: string
  text: string
}) {
  if (!isEmailConfigured()) {
    console.warn('Email notification skipped: SMTP email is not configured')
    return
  }

  try {
    await sendEmail(options)
  } catch (error) {
    console.error('Email notification failed', error)
  }
}

async function sendAdminEmail(
  subject: string,
  title: string,
  intro: string,
  items: Array<[string, unknown]>
) {
  await safeSendEmail({
    to: adminEmails(),
    subject,
    html: adminEmailShell(title, intro, items),
    text: textFromPairs(title, intro, items),
  })
}

async function getBookingEmailData(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      vehicle: { select: { name: true } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      legs: {
        orderBy: { departureDate: 'asc' },
        include: {
          fleetVehicle: { select: { label: true, plateNumber: true, color: true } },
          driver: { select: { name: true, phone: true, email: true } },
        },
      },
    },
  })
}

function bookingReference(booking: NonNullable<BookingEmailData>) {
  return (
    booking.paymentId ||
    booking.payments[0]?.reference ||
    `BFY-${booking.id.slice(-8).toUpperCase()}`
  )
}

function bookingRows(booking: NonNullable<BookingEmailData>) {
  const firstLeg = booking.legs[0]
  const returnLeg = booking.legs.find((leg) => leg.direction === 'return')
  return [
    ['Booking reference', bookingReference(booking)],
    ['Route', `${booking.from} to ${booking.to}`],
    ['Trip type', booking.tripType === 'round_trip' ? 'Round trip' : 'One way'],
    ['Departure date', formatDate(booking.date)],
    [
      'Return date',
      returnLeg
        ? formatDate(returnLeg.departureDate)
        : booking.returnDate
          ? formatDate(booking.returnDate)
          : 'Not applicable',
    ],
    ['Passengers', booking.passengers],
    ['Lead passenger', booking.passengerName || booking.user?.name],
    ['Passenger email', booking.passengerEmail || booking.user?.email],
    ['Passenger phone', booking.passengerPhone || booking.user?.phone],
    ['Vehicle category', booking.vehicle.name],
    ['Fleet unit', firstLeg?.fleetVehicle?.label],
    ['Plate number', firstLeg?.fleetVehicle?.plateNumber],
    ['Driver', firstLeg?.driver?.name],
    ['Driver phone', firstLeg?.driver?.phone],
    ['Pickup address', booking.pickupAddress],
    ['Dropoff address', booking.dropoffAddress],
    ['Amount', money(booking.priceNGN)],
    ['Status', booking.status],
  ] satisfies Array<[string, unknown]>
}

export async function notifyBookingCreatedPending(bookingId: string) {
  const booking = await getBookingEmailData(bookingId)
  if (!booking) return

  await sendAdminEmail(
    `Pending booking created: ${booking.from} to ${booking.to}`,
    'Pending Booking Created',
    'A customer started checkout. This booking is not confirmed until payment succeeds.',
    bookingRows(booking)
  )
}

export async function notifyAutoAccountCreated(userId: string, bookingId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  })
  if (!user?.email) return

  const items: Array<[string, unknown]> = [
    ['Account email', user.email],
    ['Name', user.name],
    ['Booking', bookingId ? `BFY-${bookingId.slice(-8).toUpperCase()}` : 'Not linked'],
  ]

  await safeSendEmail({
    to: user.email,
    subject: 'Your Beninfy account is ready',
    html: accountEmailShell(
      'Your Beninfy Account Is Ready',
      'We created a Beninfy customer account with your booking email so you can manage your trip details.',
      items
    ),
    text: textFromPairs(
      'Your Beninfy Account Is Ready',
      'We created a Beninfy customer account with your booking email so you can manage your trip details.',
      items
    ),
  })
}

export async function notifyPaymentSuccess(bookingId: string, paymentId: string) {
  const booking = await getBookingEmailData(bookingId)
  if (!booking) return

  const payment = booking.payments.find((item) => item.id === paymentId) ?? booking.payments[0]
  const items = bookingRows(booking)
  const customerEmail = booking.passengerEmail || booking.user?.email

  if (customerEmail) {
    await safeSendEmail({
      to: customerEmail,
      subject: `Booking confirmed: ${booking.from} to ${booking.to}`,
      html: customerEmailShell(
        'Booking Confirmed',
        'Your payment was received and your Beninfy ride is now confirmed. Our operations team will coordinate the trip details with you.',
        items,
        {
          title: 'Travel policy reminder',
          copy: 'Please keep your travel documents ready before departure. Late cancellations under 24 hours may attract the full one-way trip cost as a cancellation fee.',
        }
      ),
      text: textFromPairs(
        'Booking Confirmed',
        'Your payment was received and your Beninfy ride is now confirmed.',
        items
      ),
    })
  }

  await sendAdminEmail(
    `Paid booking confirmed: ${booking.from} to ${booking.to}`,
    'Paid Booking Confirmed',
    'A customer payment succeeded and the fleet reservation is now active.',
    [
      ...items,
      ['Payment provider', payment?.provider],
      ['Payment reference', payment?.reference],
      ['Provider reference', payment?.providerReference],
    ]
  )

  await notifyPaymentConfirmedPush(bookingId, paymentId).catch((error) => {
    console.warn('Payment confirmation push notification failed', {
      bookingId,
      paymentId,
      error: error instanceof Error ? error.message : 'unknown',
    })
  })
}

export async function notifyPaymentIssue(input: {
  bookingId?: string
  reference?: string
  provider?: string
  status: string
  message: string
}) {
  const booking = input.bookingId ? await getBookingEmailData(input.bookingId) : null
  await sendAdminEmail(
    `Payment issue: ${input.status}`,
    'Payment Issue Needs Review',
    'A payment could not be settled cleanly. Please review before confirming or dispatching the ride.',
    [
      ['Status', input.status],
      ['Message', input.message],
      ['Provider', input.provider],
      ['Reference', input.reference],
      ...(booking ? bookingRows(booking) : []),
    ]
  )

  if (input.bookingId && input.status === 'failed') {
    await notifyPaymentFailedPush(input.bookingId).catch((error) => {
      console.warn('Payment failure push notification failed', {
        bookingId: input.bookingId,
        reference: input.reference,
        error: error instanceof Error ? error.message : 'unknown',
      })
    })
  }
}

export async function notifyBookingStatusChanged(bookingId: string, status: string) {
  const booking = await getBookingEmailData(bookingId)
  if (!booking) return

  const items = bookingRows(booking)
  const customerEmail = booking.passengerEmail || booking.user?.email
  const title = `Booking ${status}`
  const intro =
    status === 'cancelled'
      ? 'Your Beninfy booking has been cancelled. Please contact support if you need help with a new trip or refund review.'
      : status === 'completed'
        ? 'Your Beninfy trip has been marked as completed. Thank you for choosing Beninfy Rides.'
        : status === 'confirmed'
          ? 'Your Beninfy booking has been confirmed by operations.'
          : 'Your Beninfy booking status has been updated.'

  if (customerEmail) {
    await safeSendEmail({
      to: customerEmail,
      subject: `Beninfy booking ${status}`,
      html: customerEmailShell(title, intro, items),
      text: textFromPairs(title, intro, items),
    })
  }

  await sendAdminEmail(
    `Booking status updated: ${status}`,
    title,
    'A booking status was updated in the backoffice.',
    items
  )
}

export async function notifyBookingAssignmentChanged(
  bookingLegId: string,
  previousDriverId?: string | null
) {
  const leg = await prisma.bookingLeg.findUnique({
    where: { id: bookingLegId },
    include: {
      booking: {
        include: {
          user: { select: { name: true, email: true, phone: true } },
          vehicle: { select: { name: true } },
        },
      },
      fleetVehicle: { select: { label: true, plateNumber: true, color: true } },
      driver: { select: { name: true, phone: true, email: true } },
    },
  })
  if (!leg) return

  const items: Array<[string, unknown]> = [
    ['Booking reference', `BFY-${leg.bookingId.slice(-8).toUpperCase()}`],
    ['Leg', leg.direction],
    ['Route', `${leg.from} to ${leg.to}`],
    ['Departure date', formatDate(leg.departureDate)],
    ['Customer', leg.booking.passengerName || leg.booking.user?.name],
    ['Customer phone', leg.booking.passengerPhone || leg.booking.user?.phone],
    ['Customer email', leg.booking.passengerEmail || leg.booking.user?.email],
    ['Vehicle category', leg.booking.vehicle.name],
    ['Fleet unit', leg.fleetVehicle?.label],
    ['Plate number', leg.fleetVehicle?.plateNumber],
    ['Vehicle color', leg.fleetVehicle?.color],
    ['Driver', leg.driver?.name],
    ['Driver phone', leg.driver?.phone],
    ['Status', leg.status],
  ]

  const customerEmail = leg.booking.passengerEmail || leg.booking.user?.email
  if (customerEmail && (leg.driver || leg.fleetVehicle)) {
    await safeSendEmail({
      to: customerEmail,
      subject: 'Your Beninfy trip assignment was updated',
      html: customerEmailShell(
        'Trip Assignment Updated',
        'Your trip assignment has been updated by Beninfy operations.',
        items,
        {
          title: 'Before departure',
          copy: 'Our operations team may still contact you by phone or WhatsApp to confirm pickup timing, documents, and border coordination.',
        }
      ),
      text: textFromPairs(
        'Trip Assignment Updated',
        'Your trip assignment has been updated by Beninfy operations.',
        items
      ),
    })
  }

  if (leg.driver?.email) {
    await safeSendEmail({
      to: leg.driver.email,
      subject: `Beninfy dispatch: ${leg.from} to ${leg.to}`,
      html: systemEmailShell(
        'New Driver Assignment',
        'You have been assigned to a Beninfy trip. Please review the trip details and coordinate with operations.',
        items
      ),
      text: textFromPairs(
        'New Driver Assignment',
        'You have been assigned to a Beninfy trip.',
        items
      ),
    })
  }

  await sendAdminEmail(
    'Booking assignment updated',
    'Booking Assignment Updated',
    'A booking leg assignment was updated.',
    items
  )

  await notifyAssignmentPush({ bookingLegId, previousDriverId }).catch((error) => {
    console.warn('Assignment push notification failed', {
      bookingLegId,
      previousDriverId,
      error: error instanceof Error ? error.message : 'unknown',
    })
  })
}

export async function notifyUserRegistered(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  })
  if (!user?.email) return

  const items: Array<[string, unknown]> = [
    ['Name', user.name],
    ['Email', user.email],
  ]
  await safeSendEmail({
    to: user.email,
    subject: 'Welcome to Beninfy',
    html: accountEmailShell(
      'Welcome To Beninfy',
      'Your Beninfy account has been created. You can now book private cross-border rides and manage your trips from your dashboard.',
      items
    ),
    text: textFromPairs('Welcome To Beninfy', 'Your Beninfy account has been created.', items),
  })

  await sendAdminEmail(
    'New Beninfy user registered',
    'New User Registered',
    'A new customer account was created.',
    items
  )
}

export async function notifyAdminUserCreated(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true },
  })
  if (!user?.email) return
  const items: Array<[string, unknown]> = [
    ['Name', user.name],
    ['Email', user.email],
    ['Role', user.role],
  ]

  await safeSendEmail({
    to: user.email,
    subject: 'Your Beninfy backoffice account was created',
    html: accountEmailShell(
      'Backoffice Account Created',
      'A Beninfy backoffice account has been created for you. Please sign in and change your password if required by operations.',
      items
    ),
    text: textFromPairs(
      'Backoffice Account Created',
      'A Beninfy backoffice account has been created for you.',
      items
    ),
  })

  await sendAdminEmail(
    'Backoffice user created',
    'Backoffice User Created',
    'A backoffice account was created.',
    items
  )
}

export async function notifyPasswordChanged(userId: string, mode: 'self' | 'admin_reset') {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true },
  })
  if (!user?.email) return
  const items: Array<[string, unknown]> = [
    ['Name', user.name],
    ['Email', user.email],
    ['Role', user.role],
    ['Change type', mode === 'self' ? 'Self-service password change' : 'Admin password reset'],
  ]

  await safeSendEmail({
    to: user.email,
    subject: 'Your Beninfy password was changed',
    html: accountEmailShell(
      'Password Changed',
      'Your Beninfy account password was changed. If you did not request this, contact operations immediately.',
      items
    ),
    text: textFromPairs('Password Changed', 'Your Beninfy account password was changed.', items),
  })

  await sendAdminEmail(
    'Beninfy password changed',
    'Password Changed',
    'An account password was changed.',
    items
  )
}

export async function notifyCouponChanged(
  action: 'created' | 'updated' | 'deleted',
  details: Array<[string, unknown]>
) {
  await sendAdminEmail(
    `Coupon ${action}`,
    `Coupon ${action}`,
    `A coupon was ${action} in the backoffice.`,
    details
  )
}

export async function notifyDriverChanged(
  action: 'created' | 'updated' | 'deleted',
  details: Array<[string, unknown]>
) {
  await sendAdminEmail(
    `Driver ${action}`,
    `Driver ${action}`,
    `A driver record was ${action} in the backoffice.`,
    details
  )
}

export async function notifyFleetVehicleChanged(
  action: 'created' | 'updated' | 'deleted',
  details: Array<[string, unknown]>
) {
  await sendAdminEmail(
    `Fleet unit ${action}`,
    `Fleet Unit ${action}`,
    `A fleet unit was ${action} in the backoffice.`,
    details
  )
}

export async function notifyRoutePriceChanged(
  action: 'created' | 'updated' | 'deleted',
  details: Array<[string, unknown]>
) {
  await sendAdminEmail(
    `Route price ${action}`,
    `Route Price ${action}`,
    `A route price was ${action} in the backoffice.`,
    details
  )
}

export async function notifyBackofficeRecordChanged(
  entity: string,
  action: 'created' | 'updated' | 'deleted',
  details: Array<[string, unknown]>
) {
  await sendAdminEmail(
    `${entity} ${action}`,
    `${entity} ${action}`,
    `A ${entity.toLowerCase()} record was ${action} in the backoffice.`,
    details
  )
}
