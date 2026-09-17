'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { CrudTable } from '@/components/admin/CrudTable'
import { formatNGN } from '@/lib/utils'
import { adminSecondaryButtonClass } from '@/components/admin/AdminUI'

interface Tour {
  id: string
  title: string
  country: string
  durationDays: number
  startingFromNGN: number
  image: string | null
  highlights: string[]
  [key: string]: unknown
}

function TourImageUploader({ tour, onUploaded }: { tour: Tour; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.set('image', file)
      const res = await fetch(`/api/admin/tours/${tour.id}/image`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error ?? 'Image upload failed')
        return
      }
      onUploaded()
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
      <div className="flex min-w-[260px] items-center gap-3">
      <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-[#eaddec] bg-[#fbf7fc] shadow-sm">
        {tour.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tour.image} alt={tour.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-gray-400">No image</div>
        )}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`${adminSecondaryButtonClass} !px-3 !py-2 !text-xs text-[#3e004c] disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Upload aria-hidden="true" className="h-4 w-4" />
          {uploading ? 'Uploading...' : 'Upload image'}
        </button>
        <p className="mt-1 text-[10px] text-gray-400">JPEG, PNG, WebP, AVIF. Max 6MB</p>
      </div>
    </div>
  )
}

export default function AdminToursPage() {
  const locale = useLocale()
  const [reloadKey, setReloadKey] = useState(0)

  return (
    <div className="space-y-8">
    <CrudTable<Tour>
      canCreate={false}
      key={reloadKey}
      title="Tours"
      description="Manage tour packages, images and execution-ready itineraries. Open Itinerary to configure days, stops and pickup locations."
      fetchUrl="/api/admin/tours"
      collectionKey="tours"
      itemKey="id"
      createUrl="/api/admin/tours"
      itemUrl={(id) => `/api/admin/tours/${id}`}
      columns={[
        { header: 'Image', render: (t) => <TourImageUploader tour={t} onUploaded={() => setReloadKey((key) => key + 1)} /> },
        { header: 'ID', render: (t) => <code className="text-xs text-gray-500">{t.id}</code> },
        { header: 'Title', render: (t) => <p className="font-medium text-gray-800">{t.title}</p> },
        { header: 'Country', render: (t) => t.country },
        { header: 'Days', render: (t) => t.durationDays },
        { header: 'Starting price', render: (t) => <div>{formatNGN(t.startingFromNGN)}</div> },
        { header: 'Catalogue', render: (t) => t.active ? 'Active' : 'Archived' },
        { header: 'Service', render: (t) => t.transportationOnly ? 'Transportation only' : 'Tour' },
        { header: 'Itinerary', render: (t) => <Link className={adminSecondaryButtonClass} href={'/' + locale + '/admin/tours/' + encodeURIComponent(t.id) + '/itinerary'}>Manage itinerary</Link> },
        { header: 'Highlights', render: (t) => <span className="text-xs text-gray-500">{t.highlights.length}</span> },
      ]}
      fields={[
        { name: 'id', label: 'ID (slug)', type: 'text', required: true, createOnly: true },
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'titleFr', label: 'Title (FR)', type: 'text' },
        { name: 'destination', label: 'Destination', type: 'text' },
        { name: 'destinationFr', label: 'Destination (FR)', type: 'text' },
        { name: 'country', label: 'Country', type: 'text', required: true },
        { name: 'countryFr', label: 'Country (FR)', type: 'text' },
        { name: 'durationDays', label: 'Duration (days)', type: 'number', required: true },
        { name: 'startingFromNGN', label: 'Starting price (NGN)', type: 'number', required: true, createOnly: true },
        { name: 'active', label: 'Active in catalogue', type: 'boolean' },
        { name: 'image', label: 'Image URL', type: 'text' },
        { name: 'description', label: 'Description', type: 'textarea', required: true },
        { name: 'descriptionFr', label: 'Description (FR)', type: 'textarea' },
        { name: 'highlights', label: 'Highlights', type: 'array' },
        { name: 'highlightsFr', label: 'Highlights (FR)', type: 'array' },
      ]}
    />
    <CrudTable<{ id: string; priceNGN: number; active: boolean; [key: string]: unknown }>
      title="Tour vehicle rates" fetchUrl="/api/admin/tour-rates" collectionKey="rates" itemKey="id"
      itemUrl={(id) => '/api/admin/tour-rates/' + encodeURIComponent(id)} canCreate={false} canDelete={false}
      columns={[
        { header: 'Vehicle', render: (rate) => rate.id },
        { header: 'Per Tour', render: (rate) => formatNGN(rate.priceNGN) },
        { header: 'Status', render: (rate) => rate.active ? 'Active' : 'Disabled' },
      ]}
      fields={[
        { name: 'priceNGN', label: 'Price per selected Tour (NGN)', type: 'number', required: true },
        { name: 'active', label: 'Available for Tour bookings', type: 'boolean' },
      ]}
    />
    </div>
  )
}
