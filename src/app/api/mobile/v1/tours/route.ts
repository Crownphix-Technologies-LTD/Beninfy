import { getPublicTours, getTourVehicleCategories } from '@/lib/tourCatalog'

export const runtime = 'nodejs'

export async function GET() {
  const tours = await getPublicTours()
  const vehicleCategories = await getTourVehicleCategories()
  return Response.json(
    { tours, vehicleCategories, commercialRules: {
      pricingBasis: 'vehicle_per_selected_tour', travellersMultiplyPrice: false,
      canonicalOrder: ['cotonou-city-tour', 'ouidah-tour', 'ganvie-tour'],
      pickupServiceArea: { city: 'Cotonou', countryCode: 'BJ' },
      gogotinkpo: { tourId: 'cotonou-city-tour', componentSurchargePercent: 20 },
      customItineraryRequiresOperationsQuote: true,
    } },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' } }
  )
}
