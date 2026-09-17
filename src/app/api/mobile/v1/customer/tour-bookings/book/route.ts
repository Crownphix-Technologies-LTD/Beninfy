import { POST as bookTours } from '@/app/api/mobile/v1/customer/tours/[tourId]/book/route'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  return bookTours(req, { params: Promise.resolve({ tourId: 'bundle' }) })
}
