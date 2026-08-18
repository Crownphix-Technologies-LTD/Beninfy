import { getRouteStartingPriceNGN } from '@/lib/bookingPricing'
import { getPublicRoutes } from '@/lib/routeCatalog'
import PopularRoutesClient from '@/components/sections/PopularRoutesClient'

export default async function PopularRoutes() {
  const routes = await getPublicRoutes()
  const popularRoutes = routes.filter((route) => route.popular)
  const cards = await Promise.all(
    popularRoutes.map(async (route) => ({
      id: route.id,
      from: route.from,
      to: route.to,
      durationHours: route.durationHours,
      image: route.image,
      startingPriceNGN: await getRouteStartingPriceNGN(route.id),
    }))
  )

  return <PopularRoutesClient routes={cards} />
}
