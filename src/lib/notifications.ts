import { isEmailConfigured, sendEmail } from '@/lib/email'
import { prisma } from '@/lib/prisma'

const DEFAULT_ADMIN_EMAILS = ['info@beninfy.com', 'operations@beninfy.com']

type EmailTarget = string | Array<string>

type BookingEmailData = Awaited<ReturnType<typeof getBookingEmailData>>

function adminEmails() {
  const configured = process.env.ADMIN_NOTIFICATION_EMAILS
    ?.split(',')
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

function rows(items: Array<[string, unknown]>) {
  return items
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 0;color:#6b5f70;font-size:13px;">${escapeHtml(label)}</td>
          <td style="padding:8px 0;color:#24112b;font-size:13px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join('')
}

function emailShell(title: string, intro: string, body: string) {
  return `
    <div style="margin:0;padding:24px;background:#f8f3fa;font-family:Arial,sans-serif;color:#24112b;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #eaddec;border-radius:14px;overflow:hidden;">
        <div style="padding:22px 24px;background:#3e004c;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#f4d66c;font-weight:700;">Beninfy Rides</div>
          <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;">${escapeHtml(title)}</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 18px;color:#4e4055;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>
          ${body}
          <p style="margin:24px 0 0;color:#6b5f70;font-size:13px;line-height:1.6;">
            Need help? Contact Beninfy support at support@beninfy.com or WhatsApp +229 51 01 91 34.
          </p>
        </div>
      </div>
    </div>
  `
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

async function sendAdminEmail(subject: string, title: string, intro: string, items: Array<[string, unknown]>) {
  await safeSendEmail({
    to: adminEmails(),
    subject,
    html: emailShell(title, intro, `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`),
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
  return booking.paymentId || booking.payments[0]?.reference || `BFY-${booking.id.slice(-8).toUpperCase()}`
}

function bookingRows(booking: NonNullable<BookingEmailData>) {
  const firstLeg = booking.legs[0]
  const returnLeg = booking.legs.find((leg) => leg.direction === 'return')
  return [
    ['Booking reference', bookingReference(booking)],
    ['Route', `${booking.from} to ${booking.to}`],
    ['Trip type', booking.tripType === 'round_trip' ? 'Round trip' : 'One way'],
    ['Departure date', formatDate(booking.date)],
    ['Return date', returnLeg ? formatDate(returnLeg.departureDate) : booking.returnDate ? formatDate(booking.returnDate) : 'Not applicable'],
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
  if (!user?.email) return

  const items: Array<[string, unknown]> = [
    ['Account email', user.email],
    ['Name', user.name],
    ['Booking', bookingId ? `BFY-${bookingId.slice(-8).toUpperCase()}` : 'Not linked'],
  ]

  await safeSendEmail({
    to: user.email,
    subject: 'Your Beninfy account is ready',
    html: emailShell(
      'Your Beninfy Account Is Ready',
      'We created a Beninfy customer account with your booking email so you can manage your trip details.',
      `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`
    ),
    text: textFromPairs('Your Beninfy Account Is Ready', 'We created a Beninfy customer account with your booking email so you can manage your trip details.', items),
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
      html: emailShell(
        'Booking Confirmed',
        'Your payment was received and your Beninfy ride is now confirmed. Our operations team will coordinate the trip details with you.',
        `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`
      ),
      text: textFromPairs('Booking Confirmed', 'Your payment was received and your Beninfy ride is now confirmed.', items),
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
      html: emailShell(title, intro, `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`),
      text: textFromPairs(title, intro, items),
    })
  }

  await sendAdminEmail(`Booking status updated: ${status}`, title, 'A booking status was updated in the backoffice.', items)
}

export async function notifyBookingAssignmentChanged(bookingLegId: string) {
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
      html: emailShell(
        'Trip Assignment Updated',
        'Your trip assignment has been updated by Beninfy operations.',
        `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`
      ),
      text: textFromPairs('Trip Assignment Updated', 'Your trip assignment has been updated by Beninfy operations.', items),
    })
  }

  if (leg.driver?.email) {
    await safeSendEmail({
      to: leg.driver.email,
      subject: `Beninfy dispatch: ${leg.from} to ${leg.to}`,
      html: emailShell(
        'New Driver Assignment',
        'You have been assigned to a Beninfy trip. Please review the trip details and coordinate with operations.',
        `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`
      ),
      text: textFromPairs('New Driver Assignment', 'You have been assigned to a Beninfy trip.', items),
    })
  }

  await sendAdminEmail('Booking assignment updated', 'Booking Assignment Updated', 'A booking leg assignment was updated.', items)
}

export async function notifyUserRegistered(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
  if (!user?.email) return

  const items: Array<[string, unknown]> = [
    ['Name', user.name],
    ['Email', user.email],
  ]
  await safeSendEmail({
    to: user.email,
    subject: 'Welcome to Beninfy',
    html: emailShell(
      'Welcome To Beninfy',
      'Your Beninfy account has been created. You can now book private cross-border rides and manage your trips from your dashboard.',
      `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`
    ),
    text: textFromPairs('Welcome To Beninfy', 'Your Beninfy account has been created.', items),
  })

  await sendAdminEmail('New Beninfy user registered', 'New User Registered', 'A new customer account was created.', items)
}

export async function notifyAdminUserCreated(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } })
  if (!user?.email) return
  const items: Array<[string, unknown]> = [
    ['Name', user.name],
    ['Email', user.email],
    ['Role', user.role],
  ]

  await safeSendEmail({
    to: user.email,
    subject: 'Your Beninfy backoffice account was created',
    html: emailShell(
      'Backoffice Account Created',
      'A Beninfy backoffice account has been created for you. Please sign in and change your password if required by operations.',
      `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`
    ),
    text: textFromPairs('Backoffice Account Created', 'A Beninfy backoffice account has been created for you.', items),
  })

  await sendAdminEmail('Backoffice user created', 'Backoffice User Created', 'A backoffice account was created.', items)
}

export async function notifyPasswordChanged(userId: string, mode: 'self' | 'admin_reset') {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } })
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
    html: emailShell(
      'Password Changed',
      'Your Beninfy account password was changed. If you did not request this, contact operations immediately.',
      `<table style="width:100%;border-collapse:collapse;">${rows(items)}</table>`
    ),
    text: textFromPairs('Password Changed', 'Your Beninfy account password was changed.', items),
  })

  await sendAdminEmail('Beninfy password changed', 'Password Changed', 'An account password was changed.', items)
}

export async function notifyCouponChanged(action: 'created' | 'updated' | 'deleted', details: Array<[string, unknown]>) {
  await sendAdminEmail(`Coupon ${action}`, `Coupon ${action}`, `A coupon was ${action} in the backoffice.`, details)
}

export async function notifyDriverChanged(action: 'created' | 'updated' | 'deleted', details: Array<[string, unknown]>) {
  await sendAdminEmail(`Driver ${action}`, `Driver ${action}`, `A driver record was ${action} in the backoffice.`, details)
}

export async function notifyFleetVehicleChanged(action: 'created' | 'updated' | 'deleted', details: Array<[string, unknown]>) {
  await sendAdminEmail(`Fleet unit ${action}`, `Fleet Unit ${action}`, `A fleet unit was ${action} in the backoffice.`, details)
}

export async function notifyRoutePriceChanged(action: 'created' | 'updated' | 'deleted', details: Array<[string, unknown]>) {
  await sendAdminEmail(`Route price ${action}`, `Route Price ${action}`, `A route price was ${action} in the backoffice.`, details)
}

export async function notifyBackofficeRecordChanged(entity: string, action: 'created' | 'updated' | 'deleted', details: Array<[string, unknown]>) {
  await sendAdminEmail(`${entity} ${action}`, `${entity} ${action}`, `A ${entity.toLowerCase()} record was ${action} in the backoffice.`, details)
}
