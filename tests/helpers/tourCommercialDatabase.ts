import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../../src/lib/prisma'
import { saveAdminTourItinerary } from '../../src/lib/admin/tourItinerary'
import { CANONICAL_TOUR_IDS } from '../../src/lib/tourCommercial'

export function mockCotonouGeocoding(t: TestContext) {
  const previous = process.env.GOOGLE_PLACES_API_KEY
  process.env.GOOGLE_PLACES_API_KEY = 'fixture-only-key'
  t.after(() => {
    if (previous === undefined) delete process.env.GOOGLE_PLACES_API_KEY
    else process.env.GOOGLE_PLACES_API_KEY = previous
  })
  return t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.match(String(url), /^https:\/\/geocode\.googleapis\.com\/v4\/geocode\/location\?/)
    assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'), 'fixture-only-key')
    return cotonouGeocodingResponse()
  })
}

export function cotonouGeocodingResponse() {
  return Response.json({
    results: [
      {
        addressComponents: [
          { longText: 'Cotonou', shortText: 'Cotonou', types: ['locality'] },
          { longText: 'Benin', shortText: 'BJ', types: ['country'] },
        ],
      },
    ],
  })
}

export async function configureCommercialTours(days: unknown[]) {
  await prisma.vehicle.upsert({
    where: { id: 'tour-test-sedan' },
    create: {
      id: 'tour-test-sedan',
      name: 'Synthetic sedan category',
      capacity: 6,
      tourPricingCategory: 'sedan',
    },
    update: { available: true, capacity: 6, tourPricingCategory: 'sedan' },
  })
  for (const [index, id] of CANONICAL_TOUR_IDS.entries()) {
    await prisma.tour.update({ where: { id }, data: { active: true } })
    const day = days[index] as Record<string, unknown>
    const result = await saveAdminTourItinerary(id, { days: [{ ...day, dayNumber: 1 }] })
    if (!result.ok) throw new Error('Canonical fixture configuration failed: ' + result.error)
  }
}
