import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type RateLimitOptions = {
  scope: string
  identifier: string
  limit: number
  windowMs: number
}

export function requestIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

async function checkRateLimitOnce({ scope, identifier, limit, windowMs }: RateLimitOptions) {
  const now = new Date()
  const key = createHash('sha256').update(`${scope}:${identifier}`).digest('hex')

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.rateLimitBucket.findUnique({ where: { key } })

      if (!existing || now.getTime() - existing.windowStart.getTime() >= windowMs) {
        await tx.rateLimitBucket.upsert({
          where: { key },
          create: { key, count: 1, windowStart: now },
          update: { count: 1, windowStart: now },
        })
        return { allowed: true as const, remaining: Math.max(0, limit - 1), retryAfter: 0 }
      }

      if (existing.count >= limit) {
        const retryAfter = Math.max(
          1,
          Math.ceil((windowMs - (now.getTime() - existing.windowStart.getTime())) / 1000)
        )
        return { allowed: false as const, remaining: 0, retryAfter }
      }

      const updated = await tx.rateLimitBucket.update({
        where: { key },
        data: { count: { increment: 1 } },
      })

      return {
        allowed: true as const,
        remaining: Math.max(0, limit - updated.count),
        retryAfter: 0,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  )
}

export async function checkRateLimit(options: RateLimitOptions) {
  try {
    return await checkRateLimitOnce(options)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return checkRateLimitOnce(options)
    }
    throw error
  }
}
