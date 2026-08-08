import type { ReactNode } from 'react'
import { pageMetadata, seoImages } from '@/lib/seo'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return pageMetadata({
    title: 'Book Private Cross-Border Rides in West Africa',
    description:
      'Compare available Beninfy vehicles and book private Lagos, Cotonou, Lomé, Accra, Ouidah, Porto Novo, Aného and Kpalimé rides.',
    path: 'rides',
    image: seoImages.routes,
    locale,
    keywords: ['book Lagos to Cotonou ride', 'private ride Cotonou Lome', 'Lome Accra private transport', 'Beninfy booking'],
  })
}

export default function RidesLayout({ children }: { children: ReactNode }) {
  return children
}
