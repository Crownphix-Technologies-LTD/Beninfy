import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { Session } from 'next-auth'
import { auth } from '@/lib/auth'
import { requireCustomer } from '@/lib/customer'
import { isAdminRole } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { vehicles as catalogVehicles } from '@/data/vehicles'
import { calculateBookingPricing } from '@/lib/bookingPricing'
import { findPublicRouteByCities, routePricingId } from '@/lib/routeCatalog'
import {
  resolvePickupFareZoneForRoute,
  validateRouteLocationBoundaries,
} from '@/lib/mobile/routeLocationBoundary'
import {
  assertFleetVehicleAvailable,
  assertVehicleTypeAvailable,
  findAvailableFleetVehicle,
} from '@/lib/availability'
import { normalizeCouponCode, validateCouponCode } from '@/lib/coupons'
import { notifyAutoAccountCreated, notifyBookingCreatedPending } from '@/lib/notifications'
import { refreshStalePayments } from '@/lib/paymentMaintenance'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'

const createSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date'),
  returnDate: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid return date')
    .optional(),
  tripType: z.enum(['one-way', 'round-trip']).default('one-way'),
  vehicleId: z.string().min(1),
  fleetVehicleId: z.string().min(1).optional(),
  passengers: z.number().int().positive().max(50),
  priceNGN: z.number().int().nonnegative(),
  passengerName: z.string().trim().max(100).optional(),
  passengerEmail: z.string().trim().email().optional().or(z.literal('')),
  passengerPhone: z.string().trim().max(40).optional(),
  passportId: z.string().trim().max(80).optional(),
  nationality: z.string().trim().max(80).optional(),
  travelers: z
    .array(
      z.object({
        fullName: z.string().trim().min(1).max(100),
        email: z.string().trim().email().optional().or(z.literal('')),
        phone: z.string().trim().max(40).optional().or(z.literal('')),
        passportId: z.string().trim().min(1).max(80),
        nationality: z.string().trim().min(1).max(80),
        lead: z.boolean().optional(),
        sequence: z.number().int().positive().optional(),
      })
    )
    .max(50)
    .optional(),
  pickupAddress: z.string().trim().max(240).optional(),
  pickupLatitude: z.number().min(-90).max(90).optional().nullable(),
  pickupLongitude: z.number().min(-180).max(180).optional().nullable(),
  pickupCity: z.string().trim().max(80).optional().nullable(),
  pickupCountry: z.string().trim().max(80).optional().nullable(),
  pickupCountryCode: z.string().trim().max(3).optional().nullable(),
  dropoffAddress: z.string().trim().max(240).optional(),
  dropoffLatitude: z.number().min(-90).max(90).optional().nullable(),
  dropoffLongitude: z.number().min(-180).max(180).optional().nullable(),
  dropoffCity: z.string().trim().max(80).optional().nullable(),
  dropoffCountry: z.string().trim().max(80).optional().nullable(),
  dropoffCountryCode: z.string().trim().max(3).optional().nullable(),
  destinationCity: z.string().trim().max(80).optional().nullable(),
  destinationCountry: z.string().trim().max(80).optional().nullable(),
  destinationCountryCode: z.string().trim().max(3).optional().nullable(),
  specialRequirements: z.string().trim().max(1000).optional(),
  pickupArea: z.enum(['mainland', 'island']).optional(),
  couponCode: z.string().trim().max(60).optional(),
})

class BookingAvailabilityError extends Error {
  status: number

  constructor(message: string, status = 409) {
    super(message)
    this.status = status
  }
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  const session = (await auth()) as Session | null
  const sessionRole = (session?.user as { role?: string } | undefined)?.role
  if (isAdminRole(sessionRole)) {
    return NextResponse.json({ error: 'Use the backoffice for admin accounts' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const data = parsed.data
  const leadPassengerEmail = (data.passengerEmail || session?.user?.email || '')
    .trim()
    .toLowerCase()
  if (!leadPassengerEmail) {
    return NextResponse.json({ error: 'Lead passenger email is required' }, { status: 400 })
  }
  const leadPassengerName = data.passengerName || session?.user?.name || null
  const rateLimit = await checkRateLimit({
    scope: 'booking-create',
    identifier: session?.user?.id || `${leadPassengerEmail}:${requestIp(req)}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many booking attempts' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  const existingLeadUser = !session?.user?.id
    ? await prisma.user.findUnique({
        where: { email: leadPassengerEmail },
        select: { id: true, role: true },
      })
    : null
  if (existingLeadUser && isAdminRole(existingLeadUser.role)) {
    return NextResponse.json(
      { error: 'Use a customer email address for booking checkout' },
      { status: 403 }
    )
  }
  const departureDate = new Date(data.date)
  const returnDate = data.returnDate ? new Date(data.returnDate) : null

  if (data.tripType === 'round-trip') {
    if (!returnDate) {
      return NextResponse.json(
        { error: 'Return date is required for round trips' },
        { status: 400 }
      )
    }
    if (returnDate < departureDate) {
      return NextResponse.json(
        { error: 'Return date must be on or after departure date' },
        { status: 400 }
      )
    }
  }

  let vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } })
  if (!vehicle) {
    const fromCatalog = catalogVehicles.find((v) => v.id === data.vehicleId)
    if (!fromCatalog) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
    }
    vehicle = await prisma.vehicle.create({
      data: {
        id: fromCatalog.id,
        name: fromCatalog.name,
        capacity: fromCatalog.capacity,
        available: fromCatalog.available,
      },
    })
  }

  if (data.passengers > vehicle.capacity) {
    return NextResponse.json(
      { error: `${vehicle.name} can only carry ${vehicle.capacity} passengers` },
      { status: 400 }
    )
  }
  if (data.travelers && data.travelers.length !== data.passengers) {
    return NextResponse.json(
      { error: 'Traveller manifest must match the passenger count' },
      { status: 400 }
    )
  }

  const matchedRoute = await findPublicRouteByCities(data.from, data.to)
  if (!matchedRoute) {
    return NextResponse.json({ error: 'This route is not available for booking' }, { status: 400 })
  }
  const boundary = validateRouteLocationBoundaries({
    route: matchedRoute,
    pickup: {
      city: data.pickupCity,
      country: data.pickupCountry,
      countryCode: data.pickupCountryCode,
      latitude: data.pickupLatitude,
      longitude: data.pickupLongitude,
    },
    destination: {
      city: data.destinationCity ?? data.dropoffCity,
      country: data.destinationCountry ?? data.dropoffCountry,
      countryCode: data.destinationCountryCode ?? data.dropoffCountryCode,
      latitude: data.dropoffLatitude,
      longitude: data.dropoffLongitude,
    },
  })
  if (!boundary.ok) {
    return NextResponse.json(
      { error: boundary.message, code: boundary.code, details: boundary.details },
      { status: 400 }
    )
  }
  const resolvedPickupArea = resolvePickupFareZoneForRoute({
    route: matchedRoute,
    pickup: boundary.metadata.pickupServiceArea,
  })?.pricingScope
  const selectedFleetVehicle = data.fleetVehicleId
    ? await prisma.fleetVehicle.findUnique({
        where: { id: data.fleetVehicleId },
        select: { id: true, vehicleId: true, label: true },
      })
    : null
  if (
    data.fleetVehicleId &&
    (!selectedFleetVehicle || selectedFleetVehicle.vehicleId !== vehicle.id)
  ) {
    return NextResponse.json(
      { error: 'Selected fleet unit does not belong to this vehicle category' },
      { status: 400 }
    )
  }
  const pricing = await calculateBookingPricing({
    routeId: matchedRoute.id,
    pricingRouteId: routePricingId(matchedRoute),
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    fleetVehicleId: selectedFleetVehicle?.id,
    fleetVehicleLabel: selectedFleetVehicle?.label,
    tripType: data.tripType,
    passengerCount: data.passengers,
    pickupArea: resolvedPickupArea,
    pickupAreaRequired: false,
  })
  if (!pricing.ok) {
    return NextResponse.json(
      { error: pricing.message, code: pricing.code, details: pricing.details },
      { status: pricing.code === 'ROUTE_NOT_FOUND' ? 404 : 400 }
    )
  }
  const subtotalNGN = pricing.subtotalNGN
  const normalizedCouponCode = data.couponCode ? normalizeCouponCode(data.couponCode) : ''

  try {
    const booking = await prisma.$transaction(
      async (tx) => {
        const bookingUser = session?.user?.id
          ? await tx.user.update({
              where: { id: session.user.id },
              data: {
                name: session.user.name || leadPassengerName || undefined,
                phone: data.passengerPhone || undefined,
              },
            })
          : await tx.user.upsert({
              where: { email: leadPassengerEmail },
              update: {
                name: leadPassengerName || undefined,
                phone: data.passengerPhone || undefined,
              },
              create: {
                email: leadPassengerEmail,
                name: leadPassengerName,
                phone: data.passengerPhone || null,
              },
            })
        const datesToCheck =
          data.tripType === 'round-trip' && returnDate
            ? [departureDate, returnDate]
            : [departureDate]
        const availability = await assertVehicleTypeAvailable(vehicle.id, datesToCheck, tx)
        if (!availability.ok) {
          throw new BookingAvailabilityError(availability.error, availability.status)
        }

        if (selectedFleetVehicle) {
          const fleetAvailability = await assertFleetVehicleAvailable(
            selectedFleetVehicle.id,
            vehicle.id,
            datesToCheck,
            tx
          )
          if (!fleetAvailability.ok) {
            throw new BookingAvailabilityError(fleetAvailability.error, fleetAvailability.status)
          }
        }

        const reservedFleetVehicles = new Map<string, { id: string; label: string }>()
        for (const date of datesToCheck) {
          const key = dateKey(date)
          if (reservedFleetVehicles.has(key)) continue

          if (selectedFleetVehicle) {
            reservedFleetVehicles.set(key, selectedFleetVehicle)
            continue
          }

          const fleetVehicle = await findAvailableFleetVehicle(vehicle.id, date, tx)
          if (!fleetVehicle) {
            throw new BookingAvailabilityError(
              `All ${vehicle.name} units are booked on ${key}. Please choose another vehicle or date.`
            )
          }
          reservedFleetVehicles.set(key, fleetVehicle)
        }
        const couponValidation = normalizedCouponCode
          ? await validateCouponCode(normalizedCouponCode, subtotalNGN, tx)
          : null

        if (couponValidation && !couponValidation.ok) {
          throw new BookingAvailabilityError(couponValidation.error, 400)
        }

        const appliedCoupon = couponValidation?.ok ? couponValidation : null
        const discountNGN = appliedCoupon?.discountNGN ?? 0
        const priceNGN = Math.max(0, subtotalNGN - discountNGN)

        if (appliedCoupon) {
          await tx.coupon.update({
            where: { id: appliedCoupon.coupon.id },
            data: { redeemedCount: { increment: 1 } },
          })
        }

        return tx.booking.create({
          data: {
            userId: bookingUser.id,
            from: data.from,
            to: data.to,
            date: departureDate,
            returnDate,
            tripType: data.tripType === 'round-trip' ? 'round_trip' : 'one_way',
            passengerName: leadPassengerName,
            passengerEmail: leadPassengerEmail,
            passengerPhone: data.passengerPhone || null,
            passportId: data.passportId || null,
            nationality: data.nationality || null,
            travelers: data.travelers?.length ? data.travelers : undefined,
            pickupAddress: data.pickupAddress || null,
            pickupLatitude: data.pickupLatitude ?? null,
            pickupLongitude: data.pickupLongitude ?? null,
            dropoffAddress: data.dropoffAddress || null,
            dropoffLatitude: data.dropoffLatitude ?? null,
            dropoffLongitude: data.dropoffLongitude ?? null,
            specialRequirements: data.specialRequirements || null,
            vehicleId: vehicle.id,
            passengers: data.passengers,
            priceNGN,
            discountNGN,
            couponId: appliedCoupon?.coupon.id,
            couponCode: appliedCoupon?.coupon.code,
            legs: {
              create: [
                {
                  direction: 'outbound',
                  from: data.from,
                  to: data.to,
                  departureDate,
                  vehicleId: vehicle.id,
                  fleetVehicleId: reservedFleetVehicles.get(dateKey(departureDate))?.id,
                  status: 'payment_pending',
                },
                ...(data.tripType === 'round-trip' && returnDate
                  ? [
                      {
                        direction: 'return',
                        from: data.to,
                        to: data.from,
                        departureDate: returnDate,
                        vehicleId: vehicle.id,
                        fleetVehicleId: reservedFleetVehicles.get(dateKey(returnDate))?.id,
                        status: 'payment_pending',
                      },
                    ]
                  : []),
              ],
            },
          },
          include: { legs: true },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )

    await notifyBookingCreatedPending(booking.id)
    if (!session?.user?.id && !existingLeadUser && booking.userId) {
      await notifyAutoAccountCreated(booking.userId, booking.id)
    }

    return NextResponse.json({ booking }, { status: 201 })
  } catch (error) {
    if (error instanceof BookingAvailabilityError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json(
        { error: 'Fleet availability changed while booking. Please try again.' },
        { status: 409 }
      )
    }
    throw error
  }
}

export async function GET(req: Request) {
  const customer = await requireCustomer()
  if (!customer.ok) return customer.response
  const { session } = customer
  await refreshStalePayments({ take: 50 })

  const url = new URL(req.url)
  const requestedLimit = Number(url.searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 50
  const cursor = url.searchParams.get('cursor') || undefined
  const bookings = await prisma.booking.findMany({
    where: { userId: session.user!.id },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { legs: true },
  })
  const hasNextPage = bookings.length > limit
  const page = hasNextPage ? bookings.slice(0, limit) : bookings

  return NextResponse.json({
    bookings: page,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
    },
  })
}
