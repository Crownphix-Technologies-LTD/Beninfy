import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { prisma } from '../src/lib/prisma'

const base = process.env.WEB_BOOKING_TEST_BASE_URL
const database = process.env.WEB_BOOKING_TEST_DATABASE_URL

function futureDate(days = 7) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function installGooglePlacesFixture(context: BrowserContext) {
  await context.addInitScript({
    content: `
      (() => {
        const instances = [];
        class Autocomplete {
          constructor(input) { this.input = input; instances.push(this); }
          addListener(_event, handler) { this.handler = handler; return { remove() {} }; }
          getPlace() { return this.place || {}; }
        }
        class MapFixture { fitBounds() {} setCenter() {} setZoom() {} }
        class MarkerFixture { setMap() {} }
        class BoundsFixture { extend() {} }
        window.google = {
          maps: {
            Map: MapFixture,
            Marker: MarkerFixture,
            LatLngBounds: BoundsFixture,
            SymbolPath: { CIRCLE: 0 },
            places: { Autocomplete }
          }
        };
        window.__selectBeninfyPlace = (index, address, name, latitude, longitude, city, country, countryCode) => {
          const visibleInstances = instances.filter((candidate) =>
            candidate.input.isConnected && candidate.input.offsetParent !== null
          );
          const instance = visibleInstances[index];
          if (!instance) throw new Error('Missing autocomplete fixture ' + index);
          instance.place = {
            formatted_address: address,
            name,
            place_id: 'fixture-' + index,
            address_components: [
              { long_name: city, short_name: city, types: ['locality'] },
              { long_name: country, short_name: countryCode, types: ['country'] }
            ],
            geometry: { location: { lat: () => latitude, lng: () => longitude } }
          };
          if (instance.handler) instance.handler();
        };
      })();
    `,
  })
}

async function selectPlace(
  page: Page,
  index: number,
  address: string,
  name: string,
  latitude: number,
  longitude: number,
  city = name,
  country = address.includes('Nigeria') ? 'Nigeria' : 'Benin',
  countryCode = address.includes('Nigeria') ? 'NG' : 'BJ'
) {
  const placeId = `fixture-${index}-${Date.now()}`
  await page.route('**/api/mobile/v1/guest/places/autocomplete?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        places: [{ placeId, displayName: name, formattedAddress: address }],
        attribution: { provider: 'google_places' },
      }),
    })
  })
  await page.route(`**/api/mobile/v1/guest/places/${placeId}?**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        place: {
          placeId,
          displayName: name,
          formattedAddress: address,
          latitude,
          longitude,
          city,
          country,
          countryCode,
        },
        attribution: { provider: 'google_places' },
      }),
    })
  })

  const input = page.locator('input[autocomplete="off"]:visible').nth(index)
  await input.fill(name)
  await page.getByRole('option', { name: new RegExp(name) }).click()
  await page.waitForTimeout(50)
}

test(
  'Ride and Tour website booking recovery: coordinates, auth draft and safe checkout',
  { skip: !base || !database, timeout: 180000 },
  async (t) => {
    assert.ok(['localhost', '127.0.0.1'].includes(new URL(base!).hostname))
    const databaseUrl = new URL(database!)
    assert.ok(['localhost', '127.0.0.1'].includes(databaseUrl.hostname))
    assert.match(databaseUrl.pathname, /^\/beninfy_dispatch_test/)
    assert.equal(process.env.DATABASE_URL, database)

    const password = 'Booking-fixture-2026!'
    const email = `booking-${randomUUID()}@example.test`
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Booking Fixture Customer',
        role: 'user',
        hashedPassword: await bcrypt.hash(password, 4),
      },
    })
    await prisma.vehicle.update({
      where: { id: 'saloon' },
      data: { tourPricingCategory: 'sedan', available: true },
    })
    await prisma.fleetVehicle.create({
      data: {
        vehicleId: 'saloon',
        label: `Browser fixture saloon ${randomUUID()}`,
        plateNumber: `E2E-${randomUUID()}`,
        status: 'available',
      },
    })
    for (const pricingScope of ['default', 'mainland', 'island']) {
      await prisma.routePrice.upsert({
        where: {
          routeId_vehicleId_pricingScope: {
            routeId: 'lagos-cotonou',
            vehicleId: 'saloon',
            pricingScope,
          },
        },
        update: { amountNGN: pricingScope === 'island' ? 180000 : 160000 },
        create: {
          routeId: 'lagos-cotonou',
          vehicleId: 'saloon',
          pricingScope,
          amountNGN: pricingScope === 'island' ? 180000 : 160000,
        },
      })
    }
    await prisma.tour.update({ where: { id: 'cotonou-city-tour' }, data: { active: true } })
    const itineraryDay = await prisma.tourItineraryDay.upsert({
      where: { tourId_dayNumber: { tourId: 'cotonou-city-tour', dayNumber: 1 } },
      update: { title: 'Cotonou City Tour' },
      create: {
        id: `browser-tour-day-${randomUUID()}`,
        tourId: 'cotonou-city-tour',
        dayNumber: 1,
        title: 'Cotonou City Tour',
      },
    })
    await prisma.tourItineraryStop.upsert({
      where: { itineraryDayId_sortOrder: { itineraryDayId: itineraryDay.id, sortOrder: 1 } },
      update: {
        title: 'Amazon Statue',
        address: 'Boulevard de la Marina, Cotonou, Benin',
        latitude: 6.3539,
        longitude: 2.4018,
      },
      create: {
        itineraryDayId: itineraryDay.id,
        sortOrder: 1,
        title: 'Amazon Statue',
        address: 'Boulevard de la Marina, Cotonou, Benin',
        latitude: 6.3539,
        longitude: 2.4018,
      },
    })

    const browser = await chromium.launch({ headless: true })
    try {
      await t.test('Ride rejects free text, preserves selected coordinates and initializes payment', async () => {
        const context = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 } })
        await installGooglePlacesFixture(context)
        const page = await context.newPage()
        const date = futureDate()
        await page.goto(
          `/en/rides/book?vehicle=saloon&from=Lagos&to=Cotonou&date=${date}&tripType=one-way&passengers=1`,
          { waitUntil: 'domcontentloaded' }
        )
        const leadName = page.locator('input[placeholder="As it appears on ID"]:visible').first()
        await leadName.waitFor()
        await page.waitForTimeout(300)
        await leadName.fill('Ride Fixture Customer')
        await page.locator('input[placeholder="example@domain.com"]:visible').first().fill(`ride-${randomUUID()}@example.test`)
        await page.locator('input[placeholder="+234 800 000 0000"]:visible').first().fill('+2348012345678')
        await page.locator('input[placeholder="Required for border crossing"]:visible').first().fill('TEST-PASSPORT')
        await page.locator('select:visible').first().selectOption('Nigerian')
        const addressInputs = page.locator('input[autocomplete="off"]:visible')
        await addressInputs.nth(0).fill('Ikeja test pickup')
        await addressInputs.nth(1).fill('Cotonou test destination')
        await page.locator('button:visible').filter({ hasText: 'Continue to Payment' }).click()
        await page.getByText('Select a pickup address from the search suggestions').waitFor()
        await page.getByText('Select a drop-off address from the search suggestions').waitFor()

        await selectPlace(page, 0, 'Ikeja, Lagos, Nigeria', 'Ikeja', 6.6018, 3.3515)
        await selectPlace(page, 1, 'Cotonou, Benin', 'Cotonou', 6.3703, 2.3912)
        await page.locator('button:visible').filter({ hasText: 'Continue to Payment' }).click()
        await page.waitForURL('**/en/rides/pay?**')
        const firstPaymentUrl = new URL(page.url())
        assert.equal(firstPaymentUrl.searchParams.get('pickupLatitude'), '6.6018')
        assert.equal(firstPaymentUrl.searchParams.get('dropoffLongitude'), '2.3912')
        assert.equal(firstPaymentUrl.searchParams.get('pickupCity'), 'Ikeja')
        assert.equal(firstPaymentUrl.searchParams.get('destinationCity'), 'Cotonou')
        assert.equal(firstPaymentUrl.searchParams.get('destinationCountryCode'), 'BJ')

        const backHref = await page.locator('a[href*="/en/rides/book?"]').first().getAttribute('href')
        assert.ok(backHref)
        await page.goto(backHref, { waitUntil: 'domcontentloaded' })
        await page.waitForURL('**/en/rides/book?**')
        assert.equal(await addressInputs.nth(0).inputValue(), 'Ikeja, Lagos, Nigeria')
        assert.equal(await addressInputs.nth(1).inputValue(), 'Cotonou, Benin')
        await page.locator('button:visible').filter({ hasText: 'Continue to Payment' }).click()
        await page.waitForURL('**/en/rides/pay?**')
        const restoredPaymentUrl = new URL(page.url())
        assert.equal(restoredPaymentUrl.searchParams.get('destinationCity'), 'Cotonou')
        assert.equal(restoredPaymentUrl.searchParams.get('destinationCountryCode'), 'BJ')

        await page.route('**/api/payments/initiate', async (route) => {
          const body = route.request().postDataJSON() as { bookingId?: string }
          assert.ok(body.bookingId)
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              mode: 'paystack_redirect',
              reference: 'BFY-BROWSER-RIDE',
              authorizationUrl: `${base}/en/rides/confirmed?id=${body.bookingId}&ref=BFY-BROWSER-RIDE`,
            }),
          })
        })
        const bookingResponse = page.waitForResponse(
          (response) => response.url().endsWith('/api/bookings') && response.request().method() === 'POST'
        )
        const paymentResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/api/payments/initiate') && response.request().method() === 'POST'
        )
        await page.getByRole('button', { name: /Pay Securely/ }).click()
        const createdBooking = await bookingResponse
        assert.equal(createdBooking.status(), 201, await createdBooking.text())
        assert.equal((await paymentResponse).status(), 200)
        await page.waitForURL('**/en/rides/confirmed?**')
        await page.getByRole('heading', { name: 'Booking Confirmed!' }).waitFor()
        await context.close()
      })

      await t.test('Tour draft survives authentication and completes booking with safe payment init', async () => {
        const context = await browser.newContext({ baseURL: base, viewport: { width: 390, height: 844 } })
        await installGooglePlacesFixture(context)
        const page = await context.newPage()
        await page.goto('/en/tours', { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Build your private Tour' }).waitFor()
        await page.getByRole('button', { name: /Cotonou City Tour/ }).click()
        await page.getByRole('button', { name: /Saloon/ }).click()
        await page.locator('input[type="date"]').fill(futureDate(14))
        await selectPlace(page, 0, 'Hotel du Lac, Cotonou, Benin', 'Hotel du Lac', 6.365, 2.43)
        const guestQuoteResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/api/tour-bookings/quote') &&
            response.request().method() === 'POST'
        )
        await page.getByRole('button', { name: 'Review price' }).click()
        const guestQuote = await guestQuoteResponse
        assert.equal(guestQuote.status(), 200, await guestQuote.text())
        await page.getByRole('button', { name: 'Sign in to confirm' }).click()
        await page.waitForURL('**/en/login?callbackUrl=**')

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const csrf = await (await context.request.get('/api/auth/csrf')).json()
          await context.request.post('/api/auth/callback/credentials', {
            form: {
              csrfToken: csrf.csrfToken,
              email,
              password,
              callbackUrl: `${base}/en/tours`,
            },
          })
          const session = await (await context.request.get('/api/auth/session')).json()
          if (session?.user?.id === user.id) break
        }
        assert.equal((await (await context.request.get('/api/auth/session')).json())?.user?.id, user.id)
        await page.goto('/en/tours', { waitUntil: 'domcontentloaded' })
        await page.getByRole('heading', { name: 'Build your private Tour' }).waitFor()
        assert.equal(
          await page.getByRole('button', { name: /Cotonou City Tour/ }).getAttribute('aria-pressed'),
          'true'
        )
        assert.equal(
          await page.getByPlaceholder(/Search your hotel/).inputValue(),
          'Hotel du Lac, Cotonou, Benin'
        )
        const authenticatedQuoteResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/api/tour-bookings/quote') &&
            response.request().method() === 'POST'
        )
        await page.getByRole('button', { name: 'Review price' }).click()
        const authenticatedQuote = await authenticatedQuoteResponse
        assert.equal(authenticatedQuote.status(), 200, await authenticatedQuote.text())
        const createResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/api/tour-bookings') && response.request().method() === 'POST'
        )
        await page.getByRole('button', { name: 'Confirm booking' }).click()
        assert.ok([200, 201].includes((await createResponse).status()))
        await page.waitForURL('**/en/tours/bookings/**')

        let paymentInitialized = false
        await page.route('**/api/tour-bookings/*/payment', async (route) => {
          paymentInitialized = true
          const bookingUrl = page.url()
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              payment: {
                provider: 'paystack',
                status: 'pending',
                paymentReference: 'BFY-BROWSER-TOUR',
                checkout: { authorizationUrl: bookingUrl },
              },
            }),
          })
        })
        await page.getByRole('button', { name: 'Pay with Paystack' }).click()
        await page.waitForFunction(() => document.readyState === 'complete')
        assert.equal(paymentInitialized, true)
        await context.close()
      })
    } finally {
      await browser.close()
      await prisma.$disconnect()
    }
  }
)
