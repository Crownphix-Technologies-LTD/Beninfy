import { Prisma } from '@prisma/client'
import type { MobilePrincipal } from '@/lib/mobile/auth'
import { createNotificationEvent } from '@/lib/mobile/notifications'
import { prisma } from '@/lib/prisma'
import { signRealtimeScope } from '@/lib/mobile/tracking'

export const CHAT_SEND_ENABLED_STATUSES = [
  'assigned',
  'driver_en_route',
  'driver_arrived',
  'passenger_onboard',
  'in_progress',
] as const

export const CHAT_READABLE_STATUSES = [
  ...CHAT_SEND_ENABLED_STATUSES,
  'completed',
  'cancelled',
] as const

export const CHAT_MESSAGE_MAX_LENGTH = Number(process.env.CHAT_MESSAGE_MAX_LENGTH ?? 2000)

export type ChatParticipantType = 'customer' | 'driver'
export type ChatAccessMode = 'read' | 'send'

export type ChatAccess =
  | {
      ok: true
      participantType: ChatParticipantType
      canSend: boolean
      canRead: boolean
      closedReason: string | null
      leg: {
        id: string
        bookingId: string
        status: string
        driverId: string | null
        booking: {
          userId: string | null
          passengerName: string | null
        }
        driver: {
          id: string
          name: string
          userId: string | null
        } | null
      }
    }
  | { ok: false; code: 'TRIP_NOT_FOUND' | 'FORBIDDEN' | 'CHAT_NOT_AVAILABLE'; message: string }

export type ChatRealtimeEvent = {
  event: 'chat.message_created'
  version: 1
  bookingLegId: string
  conversationId: string
  message: ChatMessageDto
}

export type RealtimeChatPublisher = {
  publish(channel: string, payload: ChatRealtimeEvent): Promise<void>
}

export type ChatMessageDto = {
  id: string
  conversationId: string
  bookingLegId: string
  senderType: ChatParticipantType | 'system'
  senderDisplayName: string | null
  messageType: 'text' | 'system'
  text: string | null
  systemEventCode: string | null
  createdAt: string
  isOwnMessage: boolean
}

export function isChatSendEligibleStatus(status: string) {
  return (CHAT_SEND_ENABLED_STATUSES as readonly string[]).includes(status)
}

export function isChatReadableStatus(status: string) {
  return (CHAT_READABLE_STATUSES as readonly string[]).includes(status)
}

export function chatClosedReasonForStatus(status: string, hasDriver: boolean) {
  if (status === 'payment_pending' || status === 'reserved') return 'awaiting_assignment'
  if (!hasDriver || status === 'unassigned') return 'unassigned'
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  return null
}

export function validateChatText(value: unknown) {
  if (typeof value !== 'string') return { ok: false as const, code: 'MESSAGE_EMPTY' as const }
  const text = value.trim()
  if (!text) return { ok: false as const, code: 'MESSAGE_EMPTY' as const }
  if (text.length > CHAT_MESSAGE_MAX_LENGTH) {
    return { ok: false as const, code: 'MESSAGE_TOO_LONG' as const }
  }
  return { ok: true as const, text }
}

export function realtimeChannelForChat(bookingLegId: string) {
  return `trip:${bookingLegId}:chat`
}

export function chatRealtimeScope({
  principal,
  bookingLegId,
}: {
  principal: MobilePrincipal
  bookingLegId: string
}) {
  const channel = realtimeChannelForChat(bookingLegId)
  return signRealtimeScope({
    principalType: principal.type === 'DRIVER' ? 'driver' : 'customer',
    principalId:
      principal.type === 'DRIVER' ? (principal.driverId ?? principal.userId) : principal.userId,
    bookingLegId,
    channel,
    permission: 'subscribe',
  })
}

export function chatMessageRealtimeEvent({
  bookingLegId,
  conversationId,
  message,
}: {
  bookingLegId: string
  conversationId: string
  message: ChatMessageDto
}): ChatRealtimeEvent {
  return {
    event: 'chat.message_created',
    version: 1,
    bookingLegId,
    conversationId,
    message,
  }
}

export function getChatPublisher(): RealtimeChatPublisher {
  return {
    async publish() {
      if ((process.env.CHAT_REALTIME_PROVIDER ?? 'metadata-only') !== 'mock') {
        throw new Error('CHAT_REALTIME_PROVIDER_NOT_CONFIGURED')
      }
    },
  }
}

export async function evaluateChatAccess({
  principal,
  bookingLegId,
  mode,
}: {
  principal: MobilePrincipal
  bookingLegId: string
  mode: ChatAccessMode
}): Promise<ChatAccess> {
  const leg = await prisma.bookingLeg.findUnique({
    where: { id: bookingLegId },
    select: {
      id: true,
      bookingId: true,
      status: true,
      driverId: true,
      booking: { select: { userId: true, passengerName: true } },
      driver: { select: { id: true, name: true, userId: true } },
    },
  })
  if (!leg) return { ok: false, code: 'TRIP_NOT_FOUND', message: 'Trip not found' }

  const participantType = principal.type === 'DRIVER' ? 'driver' : 'customer'
  const customerAuthorized =
    participantType === 'customer' && leg.booking.userId === principal.userId
  const driverAuthorized =
    participantType === 'driver' &&
    Boolean(principal.driverId) &&
    leg.driverId === principal.driverId

  if (!customerAuthorized && !driverAuthorized) {
    console.warn('Unauthorized chat access attempt', {
      bookingLegId,
      principalType: principal.type,
      principalUserId: principal.userId,
      driverId: principal.driverId ?? null,
    })
    return { ok: false, code: 'FORBIDDEN', message: 'You are not allowed to access this chat' }
  }

  const customerHasHistory =
    participantType === 'customer' && mode === 'read'
      ? (await prisma.tripConversation.count({
          where: {
            bookingLegId,
            customerUserId: principal.userId,
          },
        })) > 0
      : false
  const canRead = (isChatReadableStatus(leg.status) && Boolean(leg.driverId)) || customerHasHistory
  const canSend = isChatSendEligibleStatus(leg.status) && Boolean(leg.driverId)
  const closedReason = chatClosedReasonForStatus(leg.status, Boolean(leg.driverId))

  if ((mode === 'send' && !canSend) || (mode === 'read' && !canRead)) {
    return { ok: false, code: 'CHAT_NOT_AVAILABLE', message: 'Chat is not available for this trip' }
  }

  return {
    ok: true,
    participantType,
    canSend,
    canRead,
    closedReason,
    leg,
  }
}

export async function getOrCreateCurrentConversation(access: Extract<ChatAccess, { ok: true }>) {
  if (!access.leg.booking.userId || !access.leg.driverId) return null
  return prisma.tripConversation.upsert({
    where: {
      bookingLegId_driverId: {
        bookingLegId: access.leg.id,
        driverId: access.leg.driverId,
      },
    },
    create: {
      bookingLegId: access.leg.id,
      customerUserId: access.leg.booking.userId,
      driverId: access.leg.driverId,
      status: access.canSend ? 'open' : 'closed',
      closedAt: access.canSend ? null : new Date(),
      closedReason: access.closedReason,
    },
    update: {
      status: access.canSend ? 'open' : 'closed',
      closedAt: access.canSend ? null : undefined,
      closedReason: access.canSend ? null : access.closedReason,
    },
  })
}

export async function conversationsForAccess(access: Extract<ChatAccess, { ok: true }>) {
  if (access.participantType === 'driver') {
    if (!access.leg.driverId) return []
    const conversation = await getOrCreateCurrentConversation(access)
    return conversation ? [conversation] : []
  }

  return prisma.tripConversation.findMany({
    where: {
      bookingLegId: access.leg.id,
      customerUserId: access.leg.booking.userId ?? undefined,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}

export function toChatMessageDto({
  message,
  principal,
  driverName,
  customerName,
}: {
  message: {
    id: string
    conversationId: string
    bookingLegId: string
    senderType: string
    senderUserId: string | null
    senderDriverId: string | null
    messageType: string
    text: string | null
    systemCode: string | null
    createdAt: Date
  }
  principal: MobilePrincipal
  driverName?: string | null
  customerName?: string | null
}): ChatMessageDto {
  const senderType =
    message.senderType === 'driver' || message.senderType === 'customer'
      ? message.senderType
      : 'system'
  const isOwnMessage =
    senderType === 'customer'
      ? message.senderUserId === principal.userId
      : senderType === 'driver'
        ? message.senderDriverId === principal.driverId
        : false

  return {
    id: message.id,
    conversationId: message.conversationId,
    bookingLegId: message.bookingLegId,
    senderType,
    senderDisplayName:
      senderType === 'driver'
        ? (driverName ?? 'Driver')
        : senderType === 'customer'
          ? (customerName ?? 'Customer')
          : null,
    messageType: message.messageType === 'system' ? 'system' : 'text',
    text: message.text,
    systemEventCode: message.systemCode,
    createdAt: message.createdAt.toISOString(),
    isOwnMessage,
  }
}

export async function listChatMessages({
  principal,
  bookingLegId,
  cursor,
  limit,
}: {
  principal: MobilePrincipal
  bookingLegId: string
  cursor?: string
  limit: number
}) {
  const access = await evaluateChatAccess({ principal, bookingLegId, mode: 'read' })
  if (!access.ok) return access

  const conversations = await conversationsForAccess(access)
  const conversationIds = conversations.map((conversation) => conversation.id)
  const messages =
    conversationIds.length > 0
      ? await prisma.chatMessage.findMany({
          where: { conversationId: { in: conversationIds } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        })
      : []
  const hasMore = messages.length > limit
  const page = hasMore ? messages.slice(0, limit) : messages

  return {
    ok: true as const,
    access,
    conversations,
    messages: page.map((message) =>
      toChatMessageDto({
        message,
        principal,
        driverName: access.leg.driver?.name,
        customerName: access.leg.booking.passengerName,
      })
    ),
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    },
  }
}

async function notifyChatRecipient({
  access,
  conversationId,
  messageId,
}: {
  access: Extract<ChatAccess, { ok: true }>
  conversationId: string
  messageId: string
}) {
  const recipientUserId =
    access.participantType === 'customer' ? access.leg.driver?.userId : access.leg.booking.userId
  const appType = access.participantType === 'customer' ? 'driver' : 'customer'
  if (!recipientUserId) return null

  return createNotificationEvent({
    userId: recipientUserId,
    appType,
    type: 'chat.new_message',
    payload: {
      type: 'chat.new_message',
      version: 1,
      bookingId: access.leg.bookingId,
      bookingLegId: access.leg.id,
      conversationId,
      messageId,
    },
    dedupeKey: `chat.new_message:${messageId}`,
  })
}

export async function sendChatMessage({
  principal,
  bookingLegId,
  text,
  clientMessageId,
  publisher = getChatPublisher(),
}: {
  principal: MobilePrincipal
  bookingLegId: string
  text: string
  clientMessageId?: string | null
  publisher?: RealtimeChatPublisher
}) {
  const access = await evaluateChatAccess({ principal, bookingLegId, mode: 'send' })
  if (!access.ok) return access
  const conversation = await getOrCreateCurrentConversation(access)
  if (!conversation) {
    return {
      ok: false as const,
      code: 'CHAT_NOT_AVAILABLE' as const,
      message: 'Chat is not available for this trip',
    }
  }

  const cleanClientMessageId = clientMessageId?.trim().slice(0, 120) || null
  const createData: Prisma.ChatMessageCreateInput = {
    conversation: { connect: { id: conversation.id } },
    bookingLegId,
    senderType: access.participantType,
    senderUserId: principal.userId,
    senderDriverId: access.participantType === 'driver' ? principal.driverId : null,
    messageType: 'text',
    text,
    clientMessageId: cleanClientMessageId,
  }

  const message = cleanClientMessageId
    ? await prisma.chatMessage.upsert({
        where: {
          conversationId_senderType_clientMessageId: {
            conversationId: conversation.id,
            senderType: access.participantType,
            clientMessageId: cleanClientMessageId,
          },
        },
        create: createData,
        update: {},
      })
    : await prisma.chatMessage.create({ data: createData })

  const now = new Date()
  await prisma.tripConversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: now,
      ...(access.participantType === 'customer'
        ? { customerLastReadAt: now }
        : { driverLastReadAt: now }),
    },
  })

  const dto = toChatMessageDto({
    message,
    principal,
    driverName: access.leg.driver?.name,
    customerName: access.leg.booking.passengerName,
  })
  const channel = realtimeChannelForChat(bookingLegId)
  const event = chatMessageRealtimeEvent({
    bookingLegId,
    conversationId: conversation.id,
    message: dto,
  })

  publisher.publish(channel, event).catch((error) => {
    console.warn('Chat realtime publish failed', {
      bookingLegId,
      conversationId: conversation.id,
      messageId: message.id,
      error: error instanceof Error ? error.message : 'unknown',
    })
  })

  notifyChatRecipient({ access, conversationId: conversation.id, messageId: message.id }).catch(
    (error) => {
      console.warn('Chat push event creation failed', {
        bookingLegId,
        conversationId: conversation.id,
        messageId: message.id,
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  )

  console.info('Chat message persisted', {
    bookingLegId,
    conversationId: conversation.id,
    messageId: message.id,
    senderType: access.participantType,
  })

  return {
    ok: true as const,
    access,
    conversation,
    message: dto,
    realtime: { channel, event },
  }
}

export async function markChatRead({
  principal,
  bookingLegId,
}: {
  principal: MobilePrincipal
  bookingLegId: string
}) {
  const access = await evaluateChatAccess({ principal, bookingLegId, mode: 'read' })
  if (!access.ok) return access
  const conversations = await conversationsForAccess(access)
  const now = new Date()
  if (conversations.length > 0) {
    await prisma.tripConversation.updateMany({
      where: { id: { in: conversations.map((conversation) => conversation.id) } },
      data:
        access.participantType === 'customer'
          ? { customerLastReadAt: now }
          : { driverLastReadAt: now },
    })
  }
  return { ok: true as const, readAt: now, conversationsUpdated: conversations.length }
}

export async function chatSnapshot({
  principal,
  bookingLegId,
}: {
  principal: MobilePrincipal
  bookingLegId: string
}) {
  const access = await evaluateChatAccess({ principal, bookingLegId, mode: 'read' })
  if (!access.ok) return access
  const conversations = await conversationsForAccess(access)
  const conversationIds = conversations.map((conversation) => conversation.id)
  const lastMessage =
    conversationIds.length > 0
      ? await prisma.chatMessage.findFirst({
          where: { conversationId: { in: conversationIds } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
      : null
  const lastReadAt =
    access.participantType === 'customer'
      ? conversations.reduce<Date | null>((latest, conversation) => {
          if (!conversation.customerLastReadAt) return latest
          return !latest || conversation.customerLastReadAt > latest
            ? conversation.customerLastReadAt
            : latest
        }, null)
      : (conversations[0]?.driverLastReadAt ?? null)
  const unreadCount =
    conversationIds.length > 0
      ? await prisma.chatMessage.count({
          where: {
            conversationId: { in: conversationIds },
            senderType: { not: access.participantType },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        })
      : 0
  const realtime = chatRealtimeScope({ principal, bookingLegId })

  return {
    ok: true as const,
    snapshot: {
      bookingLegId,
      status: access.canSend ? 'open' : 'read_only',
      canSend: access.canSend,
      canRead: access.canRead,
      closeReason: access.closedReason,
      counterpart:
        access.participantType === 'customer'
          ? access.leg.driver
            ? { type: 'driver' as const, id: access.leg.driver.id, name: access.leg.driver.name }
            : null
          : {
              type: 'customer' as const,
              name: access.leg.booking.passengerName,
            },
      lastMessage: lastMessage
        ? toChatMessageDto({
            message: lastMessage,
            principal,
            driverName: access.leg.driver?.name,
            customerName: access.leg.booking.passengerName,
          })
        : null,
      unreadCount,
      realtime: {
        ...realtime,
        events: ['chat.message_created'],
      },
    },
  }
}
