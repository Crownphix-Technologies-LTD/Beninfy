import type { Route } from '@/types'

/**
 * Legacy operational route seed data.
 *
 * Production route discovery and booking must read Prisma Route records through
 * src/lib/routeCatalog.ts. This file is retained for idempotent bootstrap/import
 * tooling only and must not become a silent runtime authority again.
 */
export const routes: Route[] = [
  {
    id: 'lagos-cotonou',
    from: 'Lagos',
    fromCode: 'LOS',
    fromCountry: 'Nigeria',
    to: 'Cotonou',
    toCode: 'COT',
    toCountry: 'Benin Republic',
    durationHours: 3.5,
    popular: true,
    image: '/images/routes/lagos-cotonou.jpg',
    description:
      'The most popular cross-border route. Direct executive service from Lagos to Cotonou city centre, crossing the Seme–Kraké border.',
    descriptionFr:
      'La route transfrontalière la plus populaire. Service exécutif direct de Lagos au centre-ville de Cotonou.',
    borderCrossings: ['Seme–Kraké'],
  },
  {
    id: 'cotonou-togo',
    from: 'Cotonou',
    fromCode: 'COT',
    fromCountry: 'Benin Republic',
    to: 'Lomé',
    toCode: 'LFW',
    toCountry: 'Togo',
    durationHours: 3,
    popular: true,
    image: '/images/routes/cotonou-lome.jpg',
    description:
      'Comfortable coastal drive from Cotonou to the Togolese capital Lomé, passing through scenic beach towns.',
    descriptionFr:
      'Trajet côtier confortable de Cotonou à Lomé, la capitale togolaise, en passant par des villes balnéaires pittoresques.',
    borderCrossings: ['Hillacondji–Sanvee Condji'],
  },
  {
    id: 'lagos-porto-novo',
    from: 'Lagos',
    fromCode: 'LOS',
    fromCountry: 'Nigeria',
    to: 'Porto Novo',
    toCode: 'PNO',
    toCountry: 'Benin Republic',
    durationHours: 4,
    popular: false,
    image: '/images/routes/lagos-cotonou.jpg',
    description:
      'Private drop-off service from Lagos to Porto Novo via the Seme–Kraké border and Cotonou corridor.',
    descriptionFr:
      'Service de dépose privé de Lagos à Porto-Novo via la frontière Seme–Kraké et le corridor de Cotonou.',
    borderCrossings: ['Seme–Kraké'],
  },
  {
    id: 'lagos-ouidah',
    from: 'Lagos',
    fromCode: 'LOS',
    fromCountry: 'Nigeria',
    to: 'Ouidah',
    toCode: 'OUI',
    toCountry: 'Benin Republic',
    durationHours: 4.5,
    popular: false,
    image: '/images/routes/lagos-cotonou.jpg',
    description:
      'Private cross-border service from Lagos to Ouidah via Cotonou, ideal for heritage visits, tourism, and onward Benin Republic travel.',
    descriptionFr:
      'Service transfrontalier privé de Lagos à Ouidah via Cotonou, idéal pour les visites patrimoniales, le tourisme et les déplacements au Bénin.',
    borderCrossings: ['Seme–Kraké'],
  },
  {
    id: 'togo-ghana',
    from: 'Lomé',
    fromCode: 'LFW',
    fromCountry: 'Togo',
    to: 'Accra',
    toCode: 'ACC',
    toCountry: 'Ghana',
    durationHours: 4,
    popular: true,
    image: '/images/routes/lome-accra.jpg',
    description:
      "Cross the Togo–Ghana border at Aflao for a smooth onward journey to Accra's business district.",
    descriptionFr:
      "Traversez la frontière Togo–Ghana à Aflao pour rejoindre le quartier des affaires d'Accra.",
    borderCrossings: ['Aflao–Kodjoviakopé'],
  },
  {
    id: 'cotonou-accra',
    from: 'Cotonou',
    fromCode: 'COT',
    fromCountry: 'Benin Republic',
    to: 'Accra',
    toCode: 'ACC',
    toCountry: 'Ghana',
    durationHours: 7,
    popular: false,
    image: '/images/routes/lome-accra.jpg',
    description:
      'Private coastal ride from Cotonou to Accra through Lomé and the Aflao border.',
    descriptionFr:
      "Trajet côtier privé de Cotonou à Accra via Lomé et la frontière d'Aflao.",
    borderCrossings: ['Hillacondji–Sanvee Condji', 'Aflao–Kodjoviakopé'],
  },
  {
    id: 'lome-cotonou',
    from: 'Lomé',
    fromCode: 'LFW',
    fromCountry: 'Togo',
    to: 'Cotonou',
    toCode: 'COT',
    toCountry: 'Benin Republic',
    durationHours: 3,
    popular: false,
    image: '/images/routes/cotonou-lome.jpg',
    description:
      'Reverse coastal service from Lomé to Cotonou through the Hillacondji border.',
    descriptionFr:
      'Service côtier retour de Lomé à Cotonou via la frontière de Hillacondji.',
    borderCrossings: ['Sanvee Condji–Hillacondji'],
  },
  {
    id: 'accra-lome',
    from: 'Accra',
    fromCode: 'ACC',
    fromCountry: 'Ghana',
    to: 'Lomé',
    toCode: 'LFW',
    toCountry: 'Togo',
    durationHours: 4,
    popular: false,
    image: '/images/routes/lome-accra.jpg',
    description:
      'Private reverse route from Accra to Lomé via the Aflao border crossing.',
    descriptionFr:
      "Trajet privé retour d'Accra à Lomé via la frontière d'Aflao.",
    borderCrossings: ['Kodjoviakopé–Aflao'],
  },
  {
    id: 'accra-cotonou',
    from: 'Accra',
    fromCode: 'ACC',
    fromCountry: 'Ghana',
    to: 'Cotonou',
    toCode: 'COT',
    toCountry: 'Benin Republic',
    durationHours: 7,
    popular: false,
    image: '/images/routes/lome-accra.jpg',
    description:
      'Long-distance private ride from Accra to Cotonou through Togo and onward into Benin Republic.',
    descriptionFr:
      "Long trajet privé d'Accra à Cotonou via le Togo puis le Bénin.",
    borderCrossings: ['Kodjoviakopé–Aflao', 'Sanvee Condji–Hillacondji'],
  },
  {
    id: 'lagos-togo',
    from: 'Lagos',
    fromCode: 'LOS',
    fromCountry: 'Nigeria',
    to: 'Lomé',
    toCode: 'LFW',
    toCountry: 'Togo',
    durationHours: 6.5,
    popular: false,
    image: '/images/routes/lagos-lome.jpg',
    description:
      'One-way through Benin Republic into Togo. Ideal for business travellers and tourists heading directly to Lomé.',
    descriptionFr:
      "Aller simple à travers le Bénin jusqu'au Togo. Idéal pour les voyageurs d'affaires se rendant à Lomé.",
    borderCrossings: ['Seme–Kraké', 'Hillacondji–Sanvee Condji'],
  },
  {
    id: 'lagos-aneho',
    from: 'Lagos',
    fromCode: 'LOS',
    fromCountry: 'Nigeria',
    to: 'Aneho',
    toCode: 'ANE',
    toCountry: 'Togo',
    durationHours: 6,
    popular: false,
    image: '/images/routes/cotonou-lome.jpg',
    description:
      'Direct private ride from Lagos through Benin Republic to Aneho on the Togolese coast.',
    descriptionFr:
      'Trajet privé direct de Lagos à Aného sur la côte togolaise, en traversant le Bénin.',
    borderCrossings: ['Seme–Kraké', 'Hillacondji–Sanvee Condji'],
  },
  {
    id: 'lagos-kpalime',
    from: 'Lagos',
    fromCode: 'LOS',
    fromCountry: 'Nigeria',
    to: 'Kpalime',
    toCode: 'KPA',
    toCountry: 'Togo',
    durationHours: 8,
    popular: false,
    image: '/images/routes/cotonou-lome.jpg',
    description:
      'Private inland Togo service from Lagos to Kpalime, travelling through Benin Republic and onward from the coast.',
    descriptionFr:
      'Service privé vers l’intérieur du Togo de Lagos à Kpalimé, en passant par le Bénin puis depuis la côte.',
    borderCrossings: ['Seme–Kraké', 'Hillacondji–Sanvee Condji'],
  },
  {
    id: 'lagos-ghana',
    from: 'Lagos',
    fromCode: 'LOS',
    fromCountry: 'Nigeria',
    to: 'Accra',
    toCode: 'ACC',
    toCountry: 'Ghana',
    durationHours: 10.5,
    popular: false,
    image: '/images/routes/lagos-accra.jpg',
    description:
      'The ultimate West African overland journey from Nigeria to Ghana, passing through Benin Republic and Togo.',
    descriptionFr:
      'Le voyage terrestre ouest-africain ultime du Nigeria au Ghana, en passant par le Bénin et le Togo.',
    borderCrossings: ['Seme–Kraké', 'Hillacondji–Sanvee Condji', 'Aflao–Kodjoviakopé'],
  },
]

export const legacyRouteBorderFeeIds: Record<string, string[]> = {
  'lagos-cotonou': ['nigeria-benin'],
  'lagos-porto-novo': ['nigeria-benin'],
  'lagos-ouidah': ['nigeria-benin'],
  'cotonou-togo': ['benin-togo'],
  'lome-cotonou': ['benin-togo'],
  'togo-ghana': ['togo-ghana'],
  'accra-lome': ['togo-ghana'],
  'cotonou-accra': ['benin-togo', 'togo-ghana'],
  'accra-cotonou': ['togo-ghana', 'benin-togo'],
  'lagos-togo': ['nigeria-benin', 'benin-togo'],
  'lagos-aneho': ['nigeria-benin', 'benin-togo'],
  'lagos-kpalime': ['nigeria-benin', 'benin-togo'],
  'lagos-ghana': ['nigeria-benin', 'benin-togo', 'togo-ghana'],
}

/**
 * Finds a route corridor in either direction.
 * Pricing and journey metadata are shared by both directions of the same trip.
 */
export function findRoute(from: string, to: string) {
  return routes.find(
    (route) =>
      (route.from === from && route.to === to) ||
      (route.from === to && route.to === from)
  )
}

/** Official origin/destination cities for booking search */
export const bookingCities = [
  { city: 'Lagos', country: 'Nigeria', code: 'LOS' },
  { city: 'Cotonou', country: 'Benin Republic', code: 'COT' },
  { city: 'Porto Novo', country: 'Benin Republic', code: 'PNO' },
  { city: 'Ouidah', country: 'Benin Republic', code: 'OUI' },
  { city: 'Lomé', country: 'Togo', code: 'LFW' },
  { city: 'Aneho', country: 'Togo', code: 'ANE' },
  { city: 'Kpalime', country: 'Togo', code: 'KPA' },
  { city: 'Accra', country: 'Ghana', code: 'ACC' },
]
