import type { BorderFee } from '@/types'
import type { RouteId, TripType } from '@/types'

/**
 * Legacy border-fee seed data.
 *
 * Runtime fee calculation must use Prisma BorderFee records and Route.borderFeeIds
 * through src/lib/borderFeeCatalog.ts. This file remains only for bootstrap/import
 * compatibility and public static-policy references until all old consumers are gone.
 */
export const borderFees: BorderFee[] = [
  {
    id: 'nigeria-benin',
    country: 'Benin (Cotonou)',
    countryFr: 'Bénin (Cotonou)',
    border: 'Seme–Kraké Border',
    borderFr: 'Frontière Seme–Kraké',
    countries: ['Nigeria', 'Benin Republic'],
    feePerPersonNGN: 5_000,
    feeRoundTripNGN: 10_000,
    popular: true,
    icon: 'local_taxi',
    services: [
      'Seme Border Protocol',
      'Customs Clearance Assistance',
      'Express Processing',
    ],
    servicesFr: [
      'Protocole Frontalier de Seme',
      'Assistance au Dédouanement',
      'Traitement Express',
    ],
    documents: ['Valid Passport or ECOWAS ID', 'Yellow Fever Certificate', 'Vehicle Registration (if driving)'],
    documentsFr: ['Passeport valide ou carte CEDEAO', 'Certificat de fièvre jaune', 'Immatriculation du véhicule (si vous conduisez)'],
    tips: [
      'Cross early morning to avoid long queues',
      'Keep original documents — photocopies are not accepted',
      'Beninfy handles all border protocol on your behalf',
    ],
    tipsFr: [
      'Traversez tôt le matin pour éviter les longues files',
      'Gardez les originaux — les photocopies ne sont pas acceptées',
      'Beninfy gère tout le protocole frontalier en votre nom',
    ],
  },
  {
    id: 'benin-togo',
    country: 'Togo (Lomé)',
    countryFr: 'Togo (Lomé)',
    border: 'Hillacondji–Sanvee Condji',
    borderFr: 'Hillacondji–Sanvee Condji',
    countries: ['Benin Republic', 'Togo'],
    feePerPersonNGN: 10_400,
    feeRoundTripNGN: 20_800,
    icon: 'directions_bus',
    services: [
      'Kraké-Hilla Border Transit',
      'Biometric Verification Assist',
      'Multilingual Guide Support',
    ],
    servicesFr: [
      'Transit Frontalier Kraké-Hilla',
      'Assistance à la Vérification Biométrique',
      'Support Guide Multilingue',
    ],
    documents: ['Valid Passport or ECOWAS ID', 'Yellow Fever Certificate'],
    documentsFr: ['Passeport valide ou carte CEDEAO', 'Certificat de fièvre jaune'],
    tips: [
      'This border is generally smooth and fast',
      'Beninese CFA and Togolese CFA are interchangeable',
      'Arrive with your accommodation address ready for entry forms',
    ],
    tipsFr: [
      'Cette frontière est généralement rapide et fluide',
      'Le franc CFA béninois et togolais sont interchangeables',
      'Ayez votre adresse d\'hébergement prête pour les formulaires',
    ],
  },
  {
    id: 'togo-ghana',
    country: 'Ghana (Accra)',
    countryFr: 'Ghana (Accra)',
    border: 'Aflao–Kodjoviakopé Border',
    borderFr: 'Frontière Aflao–Kodjoviakopé',
    countries: ['Togo', 'Ghana'],
    feePerPersonNGN: 26_000,
    feeRoundTripNGN: 52_000,
    icon: 'flight_land',
    services: [
      'Aflao–Kodjoviakopé Protocol',
      'Health Declaration (Yellow Card)',
      'Priority Road Passage',
    ],
    servicesFr: [
      'Protocole Aflao–Kodjoviakopé',
      'Déclaration Sanitaire (Carnet Jaune)',
      'Passage Routier Prioritaire',
    ],
    documents: ['Valid Passport', 'Yellow Fever Certificate', 'Ghana Entry Permit (non-ECOWAS nationals)'],
    documentsFr: ['Passeport valide', 'Certificat de fièvre jaune', 'Permis d\'entrée Ghana (non-ressortissants CEDEAO)'],
    tips: [
      'Aflao border is one of the busiest in West Africa — go early',
      'Ghanaian Cedi must be obtained at border or in Accra',
      'Non-ECOWAS nationals must arrange entry permit in advance',
    ],
    tipsFr: [
      'La frontière d\'Aflao est l\'une des plus fréquentées en Afrique de l\'Ouest — arrivez tôt',
      'Le Cedi ghanéen doit être obtenu à la frontière ou à Accra',
      'Les non-ressortissants CEDEAO doivent obtenir un permis d\'entrée à l\'avance',
    ],
  },
]

const routeBorderFeeIds: Record<RouteId, string[]> = {
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

export function getRouteBorderFee(routeId: RouteId, tripType: TripType = 'one-way') {
  const feeById = new Map(borderFees.map((fee) => [fee.id, fee.feePerPersonNGN]))
  const oneWayFee = (routeBorderFeeIds[routeId] ?? []).reduce((total, borderFeeId) => {
    return total + (feeById.get(borderFeeId) ?? 0)
  }, 0)

  return tripType === 'round-trip' ? oneWayFee * 2 : oneWayFee
}
