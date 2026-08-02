'use client'

import { CrudTable } from '@/components/admin/CrudTable'
import { AdminStatusBadge } from '@/components/admin/AdminUI'
import { formatNGN } from '@/lib/utils'

interface Coupon {
  id: string
  code: string
  description: string | null
  discountType: string
  amountNGN: number | null
  percent: number | null
  active: boolean
  startsAt: string | null
  expiresAt: string | null
  minSpendNGN: number | null
  maxRedemptions: number | null
  redeemedCount: number
  [key: string]: unknown
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function discountLabel(coupon: Coupon) {
  if (coupon.discountType === 'percent') return `${coupon.percent ?? 0}%`
  return formatNGN(coupon.amountNGN ?? 0)
}

export default function AdminCouponsPage() {
  return (
    <CrudTable<Coupon>
      title="Coupons"
      description="Create and manage customer discount codes for live payment tests, promotions, partner credits, and goodwill adjustments."
      fetchUrl="/api/admin/coupons"
      collectionKey="coupons"
      itemKey="id"
      createUrl="/api/admin/coupons"
      itemUrl={(id) => `/api/admin/coupons/${id}`}
      columns={[
        {
          header: 'Code',
          render: (coupon) => (
            <div>
              <p className="font-semibold tracking-wide text-gray-900">{coupon.code}</p>
              <p className="text-xs text-gray-400">{coupon.description ?? '—'}</p>
            </div>
          ),
        },
        { header: 'Discount', render: discountLabel },
        { header: 'Status', render: (coupon) => <AdminStatusBadge status={coupon.active ? 'active' : 'inactive'} /> },
        { header: 'Min spend', render: (coupon) => coupon.minSpendNGN ? formatNGN(coupon.minSpendNGN) : '—' },
        { header: 'Usage', render: (coupon) => `${coupon.redeemedCount}${coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''}` },
        { header: 'Starts', render: (coupon) => formatDate(coupon.startsAt) },
        { header: 'Expires', render: (coupon) => formatDate(coupon.expiresAt) },
      ]}
      fields={[
        { name: 'code', label: 'Coupon code', type: 'text', required: true, placeholder: 'e.g. TEST1000' },
        { name: 'description', label: 'Description', type: 'textarea' },
        {
          name: 'discountType',
          label: 'Discount type',
          type: 'select',
          required: true,
          options: [
            { label: 'Fixed amount', value: 'fixed' },
            { label: 'Percentage', value: 'percent' },
          ],
        },
        { name: 'amountNGN', label: 'Fixed discount amount (NGN)', type: 'number' },
        { name: 'percent', label: 'Percent discount', type: 'number' },
        { name: 'active', label: 'Active', type: 'boolean' },
        { name: 'minSpendNGN', label: 'Minimum spend (NGN)', type: 'number' },
        { name: 'maxRedemptions', label: 'Max redemptions', type: 'number' },
        { name: 'startsAt', label: 'Starts at', type: 'text', placeholder: 'YYYY-MM-DD or full ISO date' },
        { name: 'expiresAt', label: 'Expires at', type: 'text', placeholder: 'YYYY-MM-DD or full ISO date' },
      ]}
      defaultValues={{ active: true, discountType: 'fixed' }}
    />
  )
}
