import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { webTourBookingSchema } from '../src/lib/webTourBookingContract'

const validRequest = {
  tourIds: ['cotonou-city-tour'] as const,
  vehicleCategoryId: 'saloon',
  gogotinkpo: false,
  itineraryMode: 'standard' as const,
  startDate: '2099-01-01',
  travellers: 2,
  pickup: {
    label: 'Hotel pickup',
    address: 'Cotonou, Benin',
    coordinates: { latitude: 6.3703, longitude: 2.3912 },
  },
}

test('web Tour booking contract strips browser-supplied commercial authority', () => {
  const parsed = webTourBookingSchema.parse({
    ...validRequest,
    priceNGN: 1,
    currencyCode: 'USD',
    executionReady: true,
  })
  assert.equal('priceNGN' in parsed, false)
  assert.equal('currencyCode' in parsed, false)
  assert.equal('executionReady' in parsed, false)
})

test('web Tour booking routes use the shared authoritative Tour services', () => {
  const create = readFileSync('src/app/api/tour-bookings/route.ts', 'utf8')
  const quote = readFileSync('src/app/api/tour-bookings/quote/route.ts', 'utf8')
  const coupon = readFileSync('src/app/api/tour-bookings/[tourBookingId]/coupon/route.ts', 'utf8')
  const payment = readFileSync('src/app/api/tour-bookings/[tourBookingId]/payment/route.ts', 'utf8')

  assert.match(create, /createCustomerTourBooking/)
  assert.match(create, /requireWebCustomer/)
  assert.match(quote, /quoteCustomerTourSelection/)
  assert.match(coupon, /setTourCoupon/)
  assert.match(payment, /initiateMobileTourBookingPayment/)
  assert.doesNotMatch(create, /priceNGN/)
})

test('web Tour payments preserve the mobile callback default and supply a web callback', () => {
  const service = readFileSync('src/lib/mobile/tourPayments.ts', 'utf8')
  const route = readFileSync('src/app/api/tour-bookings/[tourBookingId]/payment/route.ts', 'utf8')
  assert.match(service, /callbackPath \?\? `\/\$\{locale\}\/dashboard`/)
  assert.match(
    route,
    /callbackPath: `\/\$\{parsed\.data\.locale\}\/tours\/bookings\/\$\{tourBookingId\}`/
  )
  assert.match(route, /app: 'customer-web'/)
})
