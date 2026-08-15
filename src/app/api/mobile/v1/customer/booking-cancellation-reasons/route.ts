import { cancellationReasonCatalogue } from '@/lib/mobile/customerAccount'

export const runtime = 'nodejs'

export async function GET() {
  return Response.json({
    reasons: cancellationReasonCatalogue(),
    note: { required: false, maxLength: 500 },
  })
}
