'use client'

import { CrudTable } from '@/components/admin/CrudTable'

interface Route {
  id: string
  from: string
  fromCode: string | null
  to: string
  toCode: string | null
  durationHours: number
  available: boolean
  popular: boolean
  borderCrossings: string[]
  borderFeeIds: string[]
  [key: string]: unknown
}

export default function AdminRoutesPage() {
  return (
    <CrudTable<Route>
      title="Routes"
      description="Manage cross-border routes."
      fetchUrl="/api/admin/routes"
      collectionKey="routes"
      itemKey="id"
      createUrl="/api/admin/routes"
      itemUrl={(id) => `/api/admin/routes/${id}`}
      columns={[
        { header: 'ID', render: (r) => <code className="text-xs text-gray-500">{r.id}</code> },
        { header: 'From', render: (r) => <p className="font-medium text-gray-800">{r.from} {r.fromCode && <span className="text-gray-400 text-xs">({r.fromCode})</span>}</p> },
        { header: 'To', render: (r) => <p className="font-medium text-gray-800">{r.to} {r.toCode && <span className="text-gray-400 text-xs">({r.toCode})</span>}</p> },
        { header: 'Duration', render: (r) => `${r.durationHours}h` },
        { header: 'Available', render: (r) => r.available ? 'yes' : 'no' },
        { header: 'Popular', render: (r) => r.popular ? 'yes' : 'no' },
        { header: 'Borders', render: (r) => r.borderCrossings.join(', ') || '—' },
      ]}
      fields={[
        { name: 'id', label: 'ID (slug)', type: 'text', required: true, createOnly: true, placeholder: 'e.g. lagos-cotonou' },
        { name: 'from', label: 'From city', type: 'text', required: true },
        { name: 'fromCode', label: 'From code', type: 'text', placeholder: 'LOS' },
        { name: 'fromCountry', label: 'From country', type: 'text' },
        { name: 'to', label: 'To city', type: 'text', required: true },
        { name: 'toCode', label: 'To code', type: 'text', placeholder: 'COT' },
        { name: 'toCountry', label: 'To country', type: 'text' },
        { name: 'durationHours', label: 'Duration (hours)', type: 'number', required: true },
        { name: 'available', label: 'Available for booking', type: 'boolean' },
        { name: 'popular', label: 'Popular route', type: 'boolean' },
        { name: 'image', label: 'Image URL', type: 'text' },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'descriptionFr', label: 'Description (FR)', type: 'textarea' },
        { name: 'borderCrossings', label: 'Border crossings', type: 'array' },
        { name: 'borderFeeIds', label: 'Border fee IDs', type: 'array', placeholder: 'nigeria-benin\nbenin-togo' },
      ]}
    />
  )
}
