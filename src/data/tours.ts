import type { Tour } from '@/types'

export const tours: Tour[] = [
  {
    id: 'cotonou-city-tour', title: 'Cotonou City Tour', titleFr: 'Visite de Cotonou',
    destination: 'Cotonou', destinationFr: 'Cotonou', country: 'Benin Republic', durationDays: 1, startingFromNGN: 100_000,
    image: '/images/routes/lagos-cotonou.jpg',
    description: 'Private Cotonou City Tour. Gogotinkpo is an optional add-on.',
    descriptionFr: 'Visite privee de Cotonou. Gogotinkpo est une option.',
    highlights: [], highlightsFr: [], included: ['Private transport'], includedFr: ['Transport prive'],
  },
  {
    id: 'ouidah-tour', title: 'Ouidah Tour', titleFr: 'Visite de Ouidah',
    destination: 'Ouidah', destinationFr: 'Ouidah', country: 'Benin Republic', durationDays: 1, startingFromNGN: 100_000,
    image: '/images/routes/lagos-cotonou.jpg',
    description: 'Private Ouidah Tour with pickup in Cotonou.',
    descriptionFr: 'Visite privee de Ouidah au depart de Cotonou.',
    highlights: [], highlightsFr: [], included: ['Private transport'], includedFr: ['Transport prive'],
  },
  {
    id: 'ganvie-tour', title: 'Ganvie Tour', titleFr: 'Visite de Ganvie',
    destination: 'Ganvie', destinationFr: 'Ganvie', country: 'Benin Republic', durationDays: 1, startingFromNGN: 100_000,
    image: '/images/routes/lagos-cotonou.jpg',
    description: 'Transportation only. Boat trips, guides and admission are not included.',
    descriptionFr: 'Transport uniquement. Bateau, guides et entrees non inclus.',
    highlights: [], highlightsFr: [], included: ['Transportation only'], includedFr: ['Transport uniquement'],
  },
]
