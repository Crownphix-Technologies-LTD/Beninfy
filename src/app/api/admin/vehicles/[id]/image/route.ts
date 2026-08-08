import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { notifyBackofficeRecordChanged } from '@/lib/notifications'
import { prisma } from '@/lib/prisma'
import { uploadCatalogImage } from '@/lib/supabaseStorage'

const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await params
  const formData = await req.formData().catch(() => null)
  const file = formData?.get('image')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Use a JPEG, PNG, WebP, or AVIF image' }, { status: 400 })
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image must be 6MB or smaller' }, { status: 400 })
  }

  const exists = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } })
  if (!exists) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })
  }

  const uploaded = await uploadCatalogImage('vehicles', id, file)
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error }, { status: 503 })
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: { image: uploaded.url },
    select: { id: true, image: true },
  })

  await notifyBackofficeRecordChanged('Vehicle image', 'updated', [
    ['Vehicle ID', vehicle.id],
    ['Image URL', vehicle.image],
  ])

  return NextResponse.json({ vehicle })
}
