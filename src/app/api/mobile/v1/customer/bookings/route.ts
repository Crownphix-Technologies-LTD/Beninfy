import { NextResponse } from 'next/server'
import { POST as createWebBooking } from '@/app/api/bookings/route'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import { mobileError, mobileErrorFromCode } from '@/lib/mobile/errors'
import { toCustomerBookingDetailDto, toCustomerBookingSummaryDto } from '@/lib/mobile/dtos'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function GET(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const url = new URL(req.url)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)))
  const cursor = url.searchParams.get('cursor') || undefined

  const bookings = await prisma.booking.findMany({
    where: { userId: guard.principal.userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  const hasMore = bookings.length > limit
  const page = hasMore ? bookings.slice(0, limit) : bookings

  return Response.json({
    bookings: page.map(toCustomerBookingSummaryDto),
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    },
  })
}

export async function POST(req: Request) {
  const guard = await requireMobilePrincipal(req, 'CUSTOMER')
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')

  const rateLimit = await checkRateLimit({
    scope: 'mobile-booking-create',
    identifier: `${guard.principal.userId}:${requestIp(req)}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many booking attempts', 429, { retryAfter: rateLimit.retryAfter })
  }

  const body = await req.json().catch(() => null)
  const payload = {
    ...(body && typeof body === 'object' ? body : {}),
    passengerEmail: guard.principal.email,
    priceNGN: 0,
  }

  const webRequest = new Request(req.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') ?? '',
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
      'x-real-ip': req.headers.get('x-real-ip') ?? '',
    },
    body: JSON.stringify(payload),
  })

  const response = await createWebBooking(webRequest)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data?.error ?? 'Booking could not be created'
    return mobileError(response.status === 409 ? 'TRIP_NOT_AVAILABLE' : 'VALIDATION_ERROR', message, response.status)
  }

  const bookingId = data?.booking?.id
  const booking = bookingId
    ? await prisma.booking.findFirst({
        where: { id: bookingId, userId: guard.principal.userId },
        include: {
          legs: { include: { fleetVehicle: true, driver: true }, orderBy: { departureDate: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      })
    : null
  if (!booking) return NextResponse.json(data, { status: 201 })

  return Response.json({ booking: toCustomerBookingDetailDto(booking) }, { status: 201 })
}
