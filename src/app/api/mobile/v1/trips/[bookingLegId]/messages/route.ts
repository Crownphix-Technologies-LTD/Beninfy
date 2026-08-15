import { z } from 'zod'
import { checkRateLimit, requestIp } from '@/lib/rateLimit'
import { requireMobilePrincipal } from '@/lib/mobile/auth'
import {
  CHAT_MESSAGE_MAX_LENGTH,
  listChatMessages,
  sendChatMessage,
  validateChatText,
} from '@/lib/mobile/chat'
import { mobileError, mobileErrorFromCode, mobileValidationError } from '@/lib/mobile/errors'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 50

const sendSchema = z.object({
  text: z.string(),
  clientMessageId: z.string().trim().max(120).optional().nullable(),
})

export async function GET(req: Request, { params }: { params: Promise<{ bookingLegId: string }> }) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { bookingLegId } = await params
  const url = new URL(req.url)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT))
  )
  const cursor = url.searchParams.get('cursor') || undefined

  const result = await listChatMessages({
    principal: guard.principal,
    bookingLegId,
    cursor,
    limit,
  })
  if (!result.ok) return mobileErrorFromCode(result.code, result.message)

  return Response.json({
    bookingLegId,
    messages: result.messages,
    pageInfo: result.pageInfo,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingLegId: string }> }
) {
  const guard = await requireMobilePrincipal(req)
  if (!guard.ok) return mobileErrorFromCode(guard.code ?? 'UNAUTHENTICATED')
  const { bookingLegId } = await params

  const rateLimit = await checkRateLimit({
    scope: 'mobile-chat-send',
    identifier: `${guard.principal.userId}:${bookingLegId}:${requestIp(req)}`,
    limit: 60,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return mobileError('RATE_LIMITED', 'Too many chat messages', 429, {
      retryAfter: rateLimit.retryAfter,
    })
  }

  const body = await req.json().catch(() => null)
  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) return mobileValidationError('Invalid chat message', parsed.error.flatten())
  const text = validateChatText(parsed.data.text)
  if (!text.ok) {
    return mobileError(
      text.code,
      text.code === 'MESSAGE_TOO_LONG'
        ? `Message must be ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer`
        : 'Message cannot be empty',
      400
    )
  }

  const result = await sendChatMessage({
    principal: guard.principal,
    bookingLegId,
    text: text.text,
    clientMessageId: parsed.data.clientMessageId,
  })
  if (!result.ok) return mobileErrorFromCode(result.code, result.message)

  return Response.json(
    {
      message: result.message,
      realtime: {
        channel: result.realtime.channel,
        event: result.realtime.event,
      },
    },
    { status: 201 }
  )
}
